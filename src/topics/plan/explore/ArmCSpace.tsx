// Workspace ↔ C-space for a planar 2-link arm (summary notes §5 "Reading a 2-link arm C-space plot";
// 2023 Q26, 2024 Q24, 2025 Q25; review deck slides 15-16).
//
// Left: the workspace (10 × 10 m, base at (5, 5) like the papers) with draggable obstacles, the arm, the
// dashed circle of radius L1 and, round the elbow, the circle link 2 sweeps (coloured where it would hit).
// Right: the C-space on a canvas (one mask per obstacle from core/cspacegen, so dragging one obstacle only
// recomputes its own region); link-1 cells solid, link-2-only cells tinted. Tap/drag in C-space to pose the
// arm, drag the elbow or the tip (IK) in the workspace to move the dot. Plan with planCspace on the torus.
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent as RKeyboardEvent,
  type MutableRefObject,
  type PointerEvent as RPointerEvent,
} from 'react';
import type { ExploreItem } from '../../../engine/types';
import { TAU, ik2, planCspace, wrap, type CGrid, type TwoLinkArm } from '../../../core/cspace';
import { type Shape, type Vec2, shapeBounds, shapeCentre, translateShape } from '../../../core/geom2d';
import {
  LETTERS,
  cellOf,
  checkMotion,
  collisionsAt,
  gridFromMasks,
  makeCollider,
  obstacleInfo,
  obstacleMask,
  piStr,
  piTeX,
  randomWorkspace,
  segHits,
  shapeGap,
  torusDelta,
  wrapPi,
  type Collider,
  type CWorkspace,
  type PaperBox,
} from '../../../core/cspacegen';
import { useRaf } from '../../../anim/hooks';
import { mixRgb, rgbOf, useThemeColors } from '../../../ui/theme';
import { Button, Callout, LinkButton, More, Readout, Readouts, Segmented, Select, Slider, Toggle } from '../../../ui/kit';
import { PredictReveal } from '../../../ui/PredictReveal';
import { Rich } from '../../../ui/Rich';
import { svgPoint } from '../../../ui/diagrams';
import { completeChallenge, useProgress } from '../../../app/store';
import { href } from '../../../app/router';
import { freshSeed, makeRng } from '../../../engine/rng';
import { fmt } from '../../../engine/format';
import { ArmView, CsFrame, CsGridOverlay, FR, ObstacleView, WsFrame, armPoints, csFromPx, csX, csY, cspacePolylines, labelPoint, shapeD, wsArcD, wsFromPx, wsLen, wsX, wsY } from './cspaceDraw';
import { SCENES, WRAP_CHALLENGE, sceneById, type CScene } from './cspaceScenes';

export const meta: Omit<ExploreItem, 'component'> = {
  id: 'cspace',
  title: 'Workspace ↔ C-space for a 2-link arm',
  summary:
    'Drag obstacles and watch their C-space regions; tap the C-space to pose the arm or drag the arm to move the dot; plan a collision-free motion on the torus. Includes the 2023–2025 exam workspaces and the review deck’s “match the workspaces”.',
  notice:
    'Obstacles that cross the dashed circle (radius $L_1$) make full-height bands: link 1 hits them whatever $\\theta_2$ is. Obstacles outside it make link-2 blobs near $\\theta_2 \\approx 0 \\equiv 2\\pi$, cut in two by the top and bottom edges.',
  challenge: { id: WRAP_CHALLENGE, title: 'Go round: move the arm from S to G through θ₁ = 0 ≡ 2π without touching anything' },
  minutes: 12,
};

const N = 200; // C-space cells per joint (1.8° each)
const COLOR_VARS = ['--m1', '--m2', '--m3', '--m4'] as const;
const colorOfLabel = (label: string) => `var(${COLOR_VARS[Math.max(0, LETTERS.indexOf(label as (typeof LETTERS)[number])) % 4]})`;
const P = Math.PI;

// ------------------------------------------------------------------ tiny external store (per-frame state outside React)

interface Store<T> {
  get(): T;
  set(v: T): void;
  sub(l: () => void): () => void;
}
function makeStore<T>(v: T): Store<T> {
  let cur = v;
  const ls = new Set<() => void>();
  return {
    get: () => cur,
    set: (nv) => {
      cur = nv;
      ls.forEach((l) => l());
    },
    sub: (l) => {
      ls.add(l);
      return () => {
        ls.delete(l);
      };
    },
  };
}
function useStore<T>(s: Store<T>): T {
  return useSyncExternalStore(s.sub, s.get, s.get);
}

/** Calls fn at most once per animation frame with the latest arguments. */
function useRafThrottle<A extends unknown[]>(fn: (...a: A) => void) {
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const pending = useRef<A | null>(null);
  const raf = useRef(0);
  useEffect(() => () => cancelAnimationFrame(raf.current), []);
  return useCallback((...a: A) => {
    pending.current = a;
    if (raf.current) return;
    raf.current = requestAnimationFrame(() => {
      raf.current = 0;
      const p = pending.current;
      pending.current = null;
      if (p) fnRef.current(...p);
    });
  }, []);
}

// ------------------------------------------------------------------ obstacles

interface Obs {
  id: number;
  label: string;
  /** Shape as loaded (size 100 %, no offset). */
  base: Shape;
  k: number;
  dx: number;
  dy: number;
  /** Current shape (derived; a new object whenever it changes, which keys the C-space cache). */
  shape: Shape;
}

function scaleShape(s: Shape, c: Vec2, k: number): Shape {
  if (k === 1) return s;
  if (s.kind === 'circle') return { ...s, r: s.r * k };
  if (s.kind === 'rect') return { kind: 'rect', x: c.x + (s.x - c.x) * k, y: c.y + (s.y - c.y) * k, w: s.w * k, h: s.h * k };
  return { kind: 'poly', pts: s.pts.map((p) => ({ x: c.x + (p.x - c.x) * k, y: c.y + (p.y - c.y) * k })) };
}

function placed(o: Obs, k: number, dx: number, dy: number): Obs {
  let s = translateShape(scaleShape(o.base, shapeCentre(o.base), k), dx, dy);
  const [x0, y0, x1, y1] = shapeBounds(s);
  const sx = x0 < 0 ? -x0 : x1 > 10 ? 10 - x1 : 0;
  const sy = y0 < 0 ? -y0 : y1 > 10 ? 10 - y1 : 0;
  if (sx || sy) s = translateShape(s, sx, sy);
  return { ...o, k, dx: dx + sx, dy: dy + sy, shape: s };
}

let obsSeq = 1;
const mkObs = (label: string, shape: Shape): Obs => ({ id: obsSeq++, label, base: shape, k: 1, dx: 0, dy: 0, shape });

// ------------------------------------------------------------------ C-space grid with per-obstacle caching

function useCGrid(arm: TwoLinkArm, shapes: readonly Shape[]): CGrid {
  const cache = useRef<{ key: string; masks: Map<Shape, Uint8Array> }>({ key: '', masks: new Map() });
  return useMemo(() => {
    const key = `${arm.l1}|${arm.l2}`;
    const c = cache.current;
    if (c.key !== key) {
      c.key = key;
      c.masks = new Map();
    }
    const next = new Map<Shape, Uint8Array>();
    const masks = shapes.map((s) => {
      const m = c.masks.get(s) ?? obstacleMask(arm, s, N);
      next.set(s, m);
      return m;
    });
    c.masks = next;
    return gridFromMasks(masks, N);
  }, [arm, shapes]);
}

type RGBA = [number, number, number, number];

function paintGrid(canvas: HTMLCanvasElement, imgRef: MutableRefObject<ImageData | null>, g: CGrid, pal: { solid: RGBA; tint: RGBA; dimS: RGBA; dimT: RGBA }[]) {
  const n = g.n;
  if (canvas.width !== n || canvas.height !== n) {
    canvas.width = n;
    canvas.height = n;
    imgRef.current = null;
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  if (!imgRef.current) imgRef.current = ctx.createImageData(n, n);
  const data = imgRef.current.data;
  for (let j = 0; j < n; j++) {
    const row = (n - 1 - j) * n;
    for (let i = 0; i < n; i++) {
      const k = j * n + i;
      const p = (row + i) * 4;
      const h = g.hit[k];
      if (!h) {
        data[p + 3] = 0;
        continue;
      }
      const l1 = g.link1[k];
      const bit = l1 ? l1 & -l1 : h & -h;
      const o = 31 - Math.clz32(bit);
      const c = pal[o] ? (l1 & bit ? pal[o].solid : pal[o].tint) : ([128, 128, 128, 200] as RGBA);
      data[p] = c[0];
      data[p + 1] = c[1];
      data[p + 2] = c[2];
      data[p + 3] = c[3];
    }
  }
  ctx.putImageData(imgRef.current, 0, 0);
}

// ------------------------------------------------------------------ helpers

const fmtPose = (t: readonly [number, number]) => `(${piStr(wrap(t[0]))}, ${piStr(wrap(t[1]))})`;
const near = (a: readonly [number, number], b: readonly [number, number], tol = 0.1) => Math.abs(wrapPi(a[0] - b[0])) < tol && Math.abs(wrapPi(a[1] - b[1])) < tol;

/** Unwrap a list of torus points so consecutive points never jump by more than π. */
function unwrapPath(pts: readonly (readonly [number, number])[]): [number, number][] {
  const out: [number, number][] = [];
  for (const p of pts) {
    const q = out[out.length - 1];
    if (!q) out.push([p[0], p[1]]);
    else out.push([q[0] + wrapPi(p[0] - q[0]), q[1] + wrapPi(p[1] - q[1])]);
  }
  return out;
}

/** Straight C-space segment free on the grid (sampled every ~0.4 cell). */
function segFreeOnGrid(g: CGrid, a: readonly [number, number], b: readonly [number, number]): boolean {
  const cell = TAU / g.n;
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])) / (0.4 * cell)));
  for (let s = 0; s <= steps; s++) {
    const f = s / steps;
    if (g.hit[cellOf(g.n, a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f)]) return false;
  }
  return true;
}

/** Shortcut a grid path into a few straight C-space segments that stay free. */
function smoothPath(g: CGrid, raw: readonly (readonly [number, number])[]): [number, number][] {
  const u = unwrapPath(raw);
  if (u.length < 3) return u;
  const out: [number, number][] = [u[0]];
  let a = 0;
  while (a < u.length - 1) {
    let b = Math.min(u.length - 1, a + 70);
    while (b > a + 1 && !segFreeOnGrid(g, u[a], u[b])) b--;
    out.push(u[b]);
    a = b;
  }
  return out;
}

function pathLength(pts: readonly (readonly [number, number])[]) {
  let L = 0;
  for (let k = 1; k < pts.length; k++) L += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]);
  return L;
}

const wrapsIn = (pts: readonly (readonly [number, number])[], axis: 0 | 1) => {
  for (let k = 1; k < pts.length; k++) if (Math.floor(pts[k][axis] / TAU) !== Math.floor(pts[k - 1][axis] / TAU)) return true;
  return false;
};

interface Plan {
  pts: [number, number][];
  len: number;
  wraps1: boolean;
  wraps2: boolean;
}

type Anim =
  | { kind: 'path'; pts: [number, number][]; cum: number[]; total: number; s: number; speed: number; ghostEvery: number; nextGhost: number }
  | { kind: 'keys'; keys: [number, number][]; t: number; dur: number }
  | { kind: 'line'; samples: { t: [number, number]; hit: boolean }[]; t: number; dur: number; nextGhost: number }
  | { kind: 'L1'; from: number; to: number; t: number; dur: number }
  | { kind: 'hop'; from: [number, number]; delta: [number, number]; stop: number; t: number; dur: number; crash?: string; trail: [number, number][] };

interface Ghost {
  t: [number, number];
  hit: boolean;
}

interface ChalState {
  status: 'idle' | 'crashed' | 'done';
  msg: string;
  crashes: number;
}

// ------------------------------------------------------------------ subscribed layers (re-render per pose change only)

const WsArmLayer = memo(function WsArmLayer({
  store,
  arm,
  cols,
  grid,
  labels,
  sweep,
  exam,
  onHandleDown,
}: {
  store: Store<[number, number]>;
  arm: TwoLinkArm;
  cols: Collider[];
  grid: CGrid;
  labels: string[];
  sweep: boolean;
  exam: boolean;
  onHandleDown: (which: 'elbow' | 'tip', e: RPointerEvent<SVGGElement>) => void;
}) {
  const [t1, t2] = useStore(store);
  const pose = { base: arm.base, l1: arm.l1, l2: arm.l2, t1, t2 };
  const { elbow, tip } = armPoints(pose);
  const c = collisionsAt(arm, cols, t1, t2);
  const hit1 = c.link1.length > 0;
  const hit2 = c.link2.length > 0;
  // The θ2 sweep: the column of C-space at this θ1 is the circle link 2 traces round the elbow.
  const arcs = useMemo(() => {
    if (!sweep) return [];
    const n = grid.n;
    const i = Math.min(n - 1, Math.floor((wrap(t1) / TAU) * n));
    const out: { d: string; o: number }[] = [];
    let j = 0;
    while (j < n) {
      const h = grid.hit[j * n + i];
      if (!h) {
        j++;
        continue;
      }
      const o = 31 - Math.clz32(h & -h);
      const s = j;
      while (j < n && (grid.hit[j * n + i] & -grid.hit[j * n + i]) === (h & -h)) j++;
      const a0 = t1 + (s * TAU) / n;
      const a1 = t1 + (j * TAU) / n;
      out.push({ d: wsArcD(elbow, arm.l2, a0, a1), o });
    }
    return out;
    // elbow follows t1
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sweep, grid, t1, arm.l2, arm.l1, arm.base.x, arm.base.y]);
  const bad = 'var(--bad)';
  const hitText = (link: string, os: number[]) => `${link} hits ${os.map((o) => labels[o]).join(', ')}`;
  return (
    <g>
      {sweep && (
        <g pointerEvents="none">
          <circle cx={wsX(elbow.x)} cy={wsY(elbow.y)} r={wsLen(arm.l2)} fill="none" stroke="var(--text-3)" strokeWidth={1} strokeDasharray="2 3" opacity={0.75} />
          {arcs.map((a, k) => (
            <path key={k} d={a.d} fill="none" stroke={exam ? 'var(--plan-cs-grey)' : colorOfLabel(labels[a.o] ?? 'A')} strokeWidth={5} strokeLinecap="butt" opacity={0.75} />
          ))}
        </g>
      )}
      <ArmView pose={pose} c1={hit1 ? bad : 'var(--text)'} c2={hit2 ? bad : 'var(--text-2)'} />
      {(hit1 || hit2) && (
        <text className="plan-cspace-note" x={wsX(tip.x)} y={wsY(tip.y) - 14} textAnchor="middle" fill={bad} style={{ fill: 'var(--bad)' }}>
          ✗ {[hit1 && hitText('link 1', c.link1), hit2 && hitText('link 2', c.link2)].filter(Boolean).join('; ')}
        </text>
      )}
      <g
        className="plan-cspace-drag"
        role="slider"
        tabIndex={-1}
        aria-label="Elbow: drag to rotate link 1 (θ1)"
        aria-valuenow={Number((t1 / P).toFixed(2))}
        onPointerDown={(e) => onHandleDown('elbow', e)}
      >
        <circle cx={wsX(elbow.x)} cy={wsY(elbow.y)} r={21} fill="transparent" />
        <circle cx={wsX(elbow.x)} cy={wsY(elbow.y)} r={7} className="plan-cspace-handle" />
      </g>
      <g
        className="plan-cspace-drag"
        role="slider"
        tabIndex={-1}
        aria-label="Tip: drag to move the tip (inverse kinematics)"
        aria-valuenow={Number((t2 / P).toFixed(2))}
        onPointerDown={(e) => onHandleDown('tip', e)}
      >
        <circle cx={wsX(tip.x)} cy={wsY(tip.y)} r={21} fill="transparent" />
        <circle cx={wsX(tip.x)} cy={wsY(tip.y)} r={7} className="plan-cspace-handle" />
      </g>
    </g>
  );
});

const WsGhosts = memo(function WsGhosts({ store, arm }: { store: Store<Ghost[]>; arm: TwoLinkArm }) {
  const ghosts = useStore(store);
  return (
    <g pointerEvents="none">
      {ghosts.map((g, k) => (
        <ArmView
          key={k}
          pose={{ base: arm.base, l1: arm.l1, l2: arm.l2, t1: g.t[0], t2: g.t[1] }}
          c1={g.hit ? 'var(--bad)' : 'var(--text-3)'}
          c2={g.hit ? 'var(--bad)' : 'var(--text-3)'}
          w1={3}
          w2={2.4}
          arcs={false}
          opacity={g.hit ? 0.55 : 0.4}
        />
      ))}
    </g>
  );
});

const CsDot = memo(function CsDot({ store }: { store: Store<[number, number]> }) {
  const [t1, t2] = useStore(store);
  const x = csX(wrap(t1));
  const y = csY(wrap(t2));
  return (
    <g pointerEvents="none">
      <line x1={x} x2={x} y1={FR.T} y2={FR.T + FR.S} stroke="var(--accent)" strokeWidth={1.2} strokeDasharray="3 3" opacity={0.7} />
      <circle cx={x} cy={y} r={11} fill="var(--accent)" opacity={0.16} />
      <circle cx={x} cy={y} r={6.5} className="plan-cspace-handle" />
    </g>
  );
});

const CsTrail = memo(function CsTrail({ store }: { store: Store<{ pts: [number, number][]; crash: [number, number] | null }> }) {
  const tr = useStore(store);
  if (tr.pts.length < 2 && !tr.crash) return null;
  return (
    <g pointerEvents="none">
      <path d={cspacePolylines(tr.pts)} fill="none" stroke="var(--accent)" strokeWidth={2.4} strokeLinejoin="round" strokeLinecap="round" />
      {tr.crash && (
        <text x={csX(wrap(tr.crash[0]))} y={csY(wrap(tr.crash[1])) + 5} textAnchor="middle" className="plan-cspace-note" style={{ fill: 'var(--bad)', fontSize: 16, fontWeight: 700 }}>
          ✗
        </text>
      )}
    </g>
  );
});

function PoseStatus({ store, arm, cols, labels }: { store: Store<[number, number]>; arm: TwoLinkArm; cols: Collider[]; labels: string[] }) {
  const [t1, t2] = useStore(store);
  const { elbow, tip } = armPoints({ base: arm.base, l1: arm.l1, l2: arm.l2, t1, t2 });
  const c = collisionsAt(arm, cols, t1, t2);
  const parts: string[] = [];
  if (c.link1.length) parts.push(`link 1 hits ${c.link1.map((o) => labels[o]).join(', ')}`);
  if (c.link2.length) parts.push(`link 2 hits ${c.link2.map((o) => labels[o]).join(', ')}`);
  const deg = (a: number) => Math.round((wrap(a) * 180) / P);
  return (
    <div className="plan-cspace-status">
      <Readouts min={150}>
        <Readout tex="\theta_1" tip="angle of link 1 from +x (rad); in units of π and degrees" text={`${piStr(wrap(t1))} (${deg(t1)}°)`} />
        <Readout tex="\theta_2" tip="angle of link 2 relative to link 1 (rad), 0 = straight" text={`${piStr(wrap(t2))} (${deg(t2)}°)`} />
        <Readout label="elbow" tip="base + L1(cos θ1, sin θ1), in metres" text={`(${fmt(elbow.x, 3)}, ${fmt(elbow.y, 3)}) m`} />
        <Readout label="tip" tip="elbow + L2(cos(θ1+θ2), sin(θ1+θ2)), in metres" text={`(${fmt(tip.x, 3)}, ${fmt(tip.y, 3)}) m`} />
      </Readouts>
      <div className={`plan-cspace-hitbox ${parts.length ? 'is-hit' : 'is-free'}`} role="status" aria-live="polite">
        {parts.length ? `✗ Collision: ${parts.join('; ')}` : '✓ Collision-free'}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ the simulation

export default function ArmCSpace() {
  const progress = useProgress();
  const chalDone = !!progress.challenges[WRAP_CHALLENGE];
  const first = SCENES[0];
  const [sceneId, setSceneId] = useState(first.id);
  const [randomScene, setRandomScene] = useState<CScene | null>(null);
  const scene = sceneId === 'random' && randomScene ? randomScene : sceneById(sceneId);
  const [l1, setL1] = useState(first.ws.l1);
  const [l2, setL2] = useState(first.ws.l2);
  const [obs, setObs] = useState<Obs[]>(() => first.ws.obstacles.map((o) => mkObs(o.label, o.shape)));
  const [selId, setSelId] = useState<number | null>(null);
  const [exam, setExam] = useState(false);
  const [sweep, setSweep] = useState(true);
  const [showBoxes, setShowBoxes] = useState(false);
  const [start, setStart] = useState<[number, number]>(first.start);
  const [goal, setGoal] = useState<[number, number]>(first.goal);
  const [plan, setPlan] = useState<Plan | null | 'none'>(null);
  const [playing, setPlaying] = useState(false);
  const [chal, setChal] = useState<ChalState>({ status: 'idle', msg: '', crashes: 0 });

  const poseStore = useMemo(() => makeStore<[number, number]>(first.pose), [first.pose]);
  const ghostStore = useMemo(() => makeStore<Ghost[]>([]), []);
  const trailStore = useMemo(() => makeStore<{ pts: [number, number][]; crash: [number, number] | null }>({ pts: [], crash: null }), []);
  const anim = useRef<Anim | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const wsSvg = useRef<SVGSVGElement>(null);
  const csSvg = useRef<SVGSVGElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<ImageData | null>(null);

  const arm = useMemo<TwoLinkArm>(() => ({ base: { x: 5, y: 5 }, l1, l2 }), [l1, l2]);
  const shapes = useMemo(() => obs.map((o) => o.shape), [obs]);
  const labels = useMemo(() => obs.map((o) => o.label), [obs]);
  const cols = useMemo(() => shapes.map(makeCollider), [shapes]);
  const grid = useCGrid(arm, shapes);
  const selIdx = obs.findIndex((o) => o.id === selId);
  const sel = selIdx >= 0 ? obs[selIdx] : null;
  const locked = !!scene.locked;
  const isChallenge = !!scene.challenge;

  // ---------------------------------------------------------------- canvas
  const theme = useThemeColors(['--m1', '--m2', '--m3', '--m4', '--text', '--surface']);
  const palette = useMemo(() => {
    const grey = mixRgb(rgbOf(theme['--surface']), rgbOf(theme['--text']), 0.58);
    return labels.map((lab, o) => {
      const base = exam ? grey : rgbOf(theme[COLOR_VARS[Math.max(0, LETTERS.indexOf(lab as (typeof LETTERS)[number])) % 4]]);
      const dim = selIdx >= 0 && selIdx !== o;
      const a = (x: number) => Math.round(x * (dim ? 0.3 : 1));
      const solid: RGBA = [base[0], base[1], base[2], a(exam ? 235 : 230)];
      const tint: RGBA = [base[0], base[1], base[2], a(exam ? 235 : 105)];
      return { solid, tint, dimS: solid, dimT: tint };
    });
  }, [theme, labels, exam, selIdx]);
  useLayoutEffect(() => {
    if (canvasRef.current) paintGrid(canvasRef.current, imgRef, grid, palette);
  }, [grid, palette]);

  // A plan is stale once the obstacles or the arm change.
  const firstGrid = useRef(true);
  useEffect(() => {
    if (firstGrid.current) {
      firstGrid.current = false;
      return;
    }
    setPlan(null);
  }, [grid]);

  // ---------------------------------------------------------------- animation loop
  const stopAnim = useCallback(() => {
    anim.current = null;
    setPlaying(false);
  }, []);

  useRaf((dt) => {
    const a = anim.current;
    if (!a) {
      setPlaying(false);
      return;
    }
    if (a.kind === 'path') {
      a.s = Math.min(a.total, a.s + a.speed * dt);
      let k = 1;
      while (k < a.cum.length - 1 && a.cum[k] < a.s) k++;
      const s0 = a.cum[k - 1];
      const f = a.cum[k] > s0 ? (a.s - s0) / (a.cum[k] - s0) : 1;
      const p: [number, number] = [a.pts[k - 1][0] + (a.pts[k][0] - a.pts[k - 1][0]) * f, a.pts[k - 1][1] + (a.pts[k][1] - a.pts[k - 1][1]) * f];
      poseStore.set([wrap(p[0]), wrap(p[1])]);
      if (a.s >= a.nextGhost) {
        ghostStore.set([...ghostStore.get(), { t: [p[0], p[1]], hit: false }]);
        a.nextGhost += a.ghostEvery;
      }
      if (a.s >= a.total) stopAnim();
    } else if (a.kind === 'keys') {
      a.t = Math.min(a.dur, a.t + dt);
      const segs = a.keys.length - 1;
      const u = (a.t / a.dur) * segs;
      const k = Math.min(segs - 1, Math.floor(u));
      const f = u - k;
      const p = a.keys[k];
      const q = a.keys[k + 1];
      poseStore.set([wrap(p[0] + (q[0] - p[0]) * f), wrap(p[1] + (q[1] - p[1]) * f)]);
      if (a.t >= a.dur) stopAnim();
    } else if (a.kind === 'line') {
      a.t = Math.min(a.dur, a.t + dt);
      const u = (a.t / a.dur) * (a.samples.length - 1);
      const k = Math.min(a.samples.length - 1, Math.round(u));
      const smp = a.samples[k];
      poseStore.set([wrap(smp.t[0]), wrap(smp.t[1])]);
      if (u >= a.nextGhost) {
        ghostStore.set([...ghostStore.get(), { t: smp.t, hit: smp.hit }]);
        a.nextGhost += (a.samples.length - 1) / 12;
      }
      if (a.t >= a.dur) stopAnim();
    } else if (a.kind === 'L1') {
      a.t = Math.min(a.dur, a.t + dt);
      const f = a.t / a.dur;
      const e = f * f * (3 - 2 * f);
      setL1(Number((a.from + (a.to - a.from) * e).toFixed(3)));
      if (a.t >= a.dur) stopAnim();
    } else if (a.kind === 'hop') {
      a.t = Math.min(a.dur, a.t + dt);
      const f = Math.min(a.stop, a.t / a.dur);
      const p: [number, number] = [a.from[0] + a.delta[0] * f, a.from[1] + a.delta[1] * f];
      poseStore.set([wrap(p[0]), wrap(p[1])]);
      trailStore.set({ pts: [...a.trail, p], crash: null });
      if (a.t / a.dur >= a.stop) {
        stopAnim();
        finishHop(p, a.crash);
      }
    }
  }, playing);

  const startAnim = (a: Anim) => {
    anim.current = a;
    setPlaying(true);
  };

  // ---------------------------------------------------------------- challenge moves
  const chalRef = useRef(chal);
  chalRef.current = chal;
  const finishHop = (p: [number, number], crash?: string) => {
    if (crash) {
      trailStore.set({ pts: trailStore.get().pts, crash: p });
      setChal((c) => ({ status: 'crashed', msg: crash, crashes: c.crashes + 1 }));
      return;
    }
    if (near(p, scene.goal)) {
      setChal((c) => ({ ...c, status: 'done', msg: '' }));
      completeChallenge(WRAP_CHALLENGE);
    }
  };
  const crashText = (hit: { t1: number; t2: number; link1: number[]; link2: number[] }) => {
    const who = [...hit.link1.map((o) => `link 1 hit ${labels[o]}`), ...hit.link2.map((o) => `link 2 hit ${labels[o]}`)].join(' and ');
    return `${who.charAt(0).toUpperCase()}${who.slice(1)} at θ = ${fmtPose([hit.t1, hit.t2])}.`;
  };

  /** Move the arm. In the challenge every move is a straight joint-space motion, checked all the way. */
  const movePose = (target: [number, number], opts: { hop?: boolean } = {}) => {
    if (!isChallenge) {
      if (anim.current && anim.current.kind !== 'L1') stopAnim();
      poseStore.set([wrap(target[0]), wrap(target[1])]);
      return;
    }
    const c = chalRef.current;
    if (c.status !== 'idle' || (anim.current && anim.current.kind === 'hop')) return;
    const from = poseStore.get();
    const delta = torusDelta(from, target);
    if (Math.abs(delta[0]) < 1e-9 && Math.abs(delta[1]) < 1e-9) return;
    const chk = checkMotion(arm, cols, from, delta, 0.005);
    const tr = trailStore.get();
    const last = tr.pts[tr.pts.length - 1] ?? from;
    if (opts.hop && Math.max(Math.abs(delta[0]), Math.abs(delta[1])) > 0.12) {
      const unFrom: [number, number] = [last[0], last[1]];
      const trail = tr.pts.length ? tr.pts.slice(-4000) : [unFrom];
      const dur = Math.max(0.25, Math.max(Math.abs(delta[0]), Math.abs(delta[1])) / 2.6);
      startAnim({ kind: 'hop', from: unFrom, delta, stop: chk.free ? 1 : chk.s, t: 0, dur, crash: chk.free ? undefined : chk.hit ? crashText(chk.hit) : 'Collision.', trail });
      return;
    }
    const end: [number, number] = chk.free ? [last[0] + delta[0], last[1] + delta[1]] : [last[0] + (chk.stop[0] - from[0]), last[1] + (chk.stop[1] - from[1])];
    poseStore.set([wrap(end[0]), wrap(end[1])]);
    trailStore.set({ pts: [...tr.pts, end].slice(-4000), crash: chk.free ? null : end });
    finishHop(end, chk.free ? undefined : chk.hit ? crashText(chk.hit) : 'Collision.');
  };

  // ---------------------------------------------------------------- scenes
  const loadScene = (s: CScene, opts: { keepPose?: boolean; select?: string } = {}) => {
    stopAnim();
    setSceneId(s.id);
    setL1(s.ws.l1);
    setL2(s.ws.l2);
    const list = s.ws.obstacles.map((o) => mkObs(o.label, o.shape));
    setObs(list);
    setSelId(list.find((o) => o.label === opts.select)?.id ?? null);
    setStart(s.start);
    setGoal(s.goal);
    setPlan(null);
    setShowBoxes(false);
    if (!opts.keepPose) poseStore.set(s.pose);
    ghostStore.set([]);
    trailStore.set({ pts: s.challenge ? [s.start] : [], crash: null });
    setChal({ status: 'idle', msg: '', crashes: 0 });
  };

  const newRandom = () => {
    const rng = makeRng(freshSeed());
    const count = rng.pick([3, 3, 4]);
    const ws = randomWorkspace(rng, { count, inside: rng.pick([1, 1, 2, 0]) });
    // free start and goal far apart (prefer ones joined by a path)
    const g = gridFromMasks(
      ws.obstacles.map((o) => obstacleMask({ base: ws.base, l1: ws.l1, l2: ws.l2 }, o.shape, 72)),
      72
    );
    const free: [number, number][] = [];
    for (let k = 0; k < 72 * 72; k++) if (!g.hit[k]) free.push([((k % 72) + 0.5) * (TAU / 72), (Math.floor(k / 72) + 0.5) * (TAU / 72)]);
    const pick = () => free[Math.floor(rng.next() * free.length)] ?? ([0.3 * P, 0.2 * P] as [number, number]);
    const s0 = pick();
    let g0 = pick();
    for (let t = 0; t < 30; t++) {
      const c = pick();
      if (Math.abs(wrapPi(c[0] - s0[0])) > 0.8 * P && planCspace(g, s0, c)) {
        g0 = c;
        break;
      }
    }
    const sc: CScene = { id: 'random', name: 'Random exam-like', note: 'A random exam-style workspace. Predict each obstacle’s region before you look: band (crosses the circle) or blob (outside)?', ws, pose: s0, start: s0, goal: g0 };
    setRandomScene(sc);
    loadScene(sc);
  };

  const sceneOptions = useMemo(() => {
    const opts = SCENES.filter((s) => !s.hidden).map((s) => ({ value: s.id, label: s.name }));
    if (sceneId === 'random') opts.push({ value: 'random', label: 'Random exam-like' });
    const hidden = SCENES.find((s) => s.id === sceneId && s.hidden);
    if (hidden) opts.push({ value: hidden.id, label: hidden.name });
    return opts;
  }, [sceneId]);

  // ---------------------------------------------------------------- obstacles: add / remove / drag / keys
  const freeLetter = () => LETTERS.find((L) => !obs.some((o) => o.label === L));
  const addObstacle = (kind: 'rect' | 'circle' | 'tri') => {
    const label = freeLetter();
    if (!label || locked) return;
    const make = (c: Vec2): Shape =>
      kind === 'rect'
        ? { kind: 'rect', x: c.x - 0.6, y: c.y - 0.6, w: 1.2, h: 1.2 }
        : kind === 'circle'
          ? { kind: 'circle', x: c.x, y: c.y, r: 0.65 }
          : { kind: 'poly', pts: [{ x: c.x - 0.7, y: c.y - 0.6 }, { x: c.x + 0.7, y: c.y - 0.6 }, { x: c.x, y: c.y + 0.7 }] };
    let best: Shape | null = null;
    let bestGap = -1;
    for (let k = 0; k < 16; k++) {
      const a = (k * TAU) / 16 + 0.2;
      for (const r of [l1 + 0.9, l1 - 0.9, 4]) {
        const c = { x: 5 + r * Math.cos(a), y: 5 + r * Math.sin(a) };
        if (c.x < 1 || c.x > 9 || c.y < 1 || c.y > 9) continue;
        const s = make(c);
        const gap = Math.min(10, ...obs.map((o) => shapeGap(o.shape, s)));
        if (gap > bestGap) {
          bestGap = gap;
          best = s;
        }
      }
    }
    if (!best) return;
    const o = mkObs(label, best);
    setObs((list) => [...list, o]);
    setSelId(o.id);
  };
  const removeSelected = () => {
    if (!sel || locked) return;
    setObs((list) => list.filter((o) => o.id !== sel.id));
    setSelId(null);
  };
  const updateObs = (id: number, f: (o: Obs) => Obs) => setObs((list) => list.map((o) => (o.id === id ? f(o) : o)));

  type Drag =
    | { kind: 'obs'; id: number; p0: Vec2; dx0: number; dy0: number }
    | { kind: 'elbow' | 'tip' }
    | { kind: 'pose' }
    | { kind: 'mark'; which: 'S' | 'G' };
  const drag = useRef<Drag | null>(null);

  const moveObsThrottled = useRafThrottle((id: number, dx: number, dy: number) => updateObs(id, (o) => placed(o, o.k, dx, dy)));
  const wsPoint = (e: { clientX: number; clientY: number }) => {
    const p = svgPoint(wsSvg.current!, e.clientX, e.clientY);
    return wsFromPx(p.x, p.y);
  };

  const onObsDown = (o: Obs, e: RPointerEvent<SVGGElement>) => {
    e.stopPropagation();
    setSelId(o.id);
    if (locked) return;
    wsSvg.current?.setPointerCapture(e.pointerId);
    drag.current = { kind: 'obs', id: o.id, p0: wsPoint(e), dx0: o.dx, dy0: o.dy };
  };
  const onObsKey = (o: Obs, e: RKeyboardEvent<SVGGElement>) => {
    const step = e.shiftKey ? 1 : 0.25;
    const mv: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    if ((e.key === 'Delete' || e.key === 'Backspace') && !locked) {
      e.preventDefault();
      setObs((list) => list.filter((q) => q.id !== o.id));
      setSelId(null);
      return;
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setSelId(o.id);
      return;
    }
    const m = mv[e.key];
    if (!m || locked) return;
    e.preventDefault();
    setSelId(o.id);
    updateObs(o.id, (q) => placed(q, q.k, q.dx + m[0], q.dy + m[1]));
  };
  const onHandleDown = useCallback((which: 'elbow' | 'tip', e: RPointerEvent<SVGGElement>) => {
    e.stopPropagation();
    wsSvg.current?.setPointerCapture(e.pointerId);
    drag.current = { kind: which };
  }, []);

  const poseFromHandle = (which: 'elbow' | 'tip', p: Vec2): [number, number] | null => {
    const t2 = poseStore.get()[1];
    if (which === 'elbow') return [Math.atan2(p.y - 5, p.x - 5), t2];
    // IK on the branch the arm is on now (θ2 in (0, π) or (π, 2π)), target clamped into the reachable ring.
    const dx = p.x - 5;
    const dy = p.y - 5;
    const r = Math.hypot(dx, dy) || 1e-6;
    const rc = Math.min(l1 + l2 - 1e-3, Math.max(Math.abs(l1 - l2) + 1e-3, r));
    const sols = ik2(arm, { x: 5 + (dx / r) * rc, y: 5 + (dy / r) * rc });
    if (!sols.length) return null;
    const s = sols[wrap(t2) <= P ? 0 : 1];
    return [s[0], s[1]];
  };
  const poseDragThrottled = useRafThrottle((which: 'elbow' | 'tip', p: Vec2) => {
    const q = poseFromHandle(which, p);
    if (q) movePose(q);
  });

  const onWsMove = (e: RPointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    if (!d) return;
    const p = wsPoint(e);
    if (d.kind === 'obs') moveObsThrottled(d.id, d.dx0 + p.x - d.p0.x, d.dy0 + p.y - d.p0.y);
    else if (d.kind === 'elbow' || d.kind === 'tip') poseDragThrottled(d.kind, p);
  };
  const endDrag = (e: RPointerEvent<SVGSVGElement>) => {
    drag.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* not captured */
    }
  };

  // ---------------------------------------------------------------- C-space pointer
  const csPoint = (e: { clientX: number; clientY: number }): [number, number] => {
    const p = svgPoint(csSvg.current!, e.clientX, e.clientY);
    return csFromPx(p.x, p.y);
  };
  const csDragThrottled = useRafThrottle((t: [number, number]) => {
    const d = drag.current;
    if (!d) return;
    if (d.kind === 'pose') movePose(t);
    else if (d.kind === 'mark') {
      const w: [number, number] = [wrap(t[0]), wrap(t[1])];
      if (d.which === 'S') setStart(w);
      else setGoal(w);
      setPlan(null);
    }
  });
  const onCsDown = (e: RPointerEvent<SVGSVGElement>) => {
    if (e.button !== undefined && e.button > 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { kind: 'pose' };
    const t = csPoint(e);
    movePose(t, { hop: true });
    // tapping a region selects the obstacle it belongs to
    const h = grid.hit[cellOf(N, t[0], t[1])];
    if (h) setSelId(obs[31 - Math.clz32(h & -h)]?.id ?? null);
  };
  const onCsMove = (e: RPointerEvent<SVGSVGElement>) => {
    if (!drag.current) return;
    csDragThrottled(csPoint(e));
  };
  const onMarkDown = (which: 'S' | 'G', e: RPointerEvent<SVGGElement>) => {
    if (isChallenge) return;
    e.stopPropagation();
    csSvg.current?.setPointerCapture(e.pointerId);
    drag.current = { kind: 'mark', which };
  };
  const onCsKey = (e: RKeyboardEvent<SVGSVGElement>) => {
    const step = (e.shiftKey ? 8 : 2) * (TAU / N);
    const mv: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    const m = mv[e.key];
    if (!m) return;
    e.preventDefault();
    const [t1, t2] = poseStore.get();
    movePose([t1 + m[0], t2 + m[1]]);
  };

  // ---------------------------------------------------------------- planning
  const startFree = !collisionsAt(arm, cols, start[0], start[1]).link1.length && !collisionsAt(arm, cols, start[0], start[1]).link2.length;
  const goalFree = !collisionsAt(arm, cols, goal[0], goal[1]).link1.length && !collisionsAt(arm, cols, goal[0], goal[1]).link2.length;
  const doPlan = (): Plan | 'none' => {
    const raw = planCspace(grid, start, goal);
    if (!raw) {
      setPlan('none');
      return 'none';
    }
    const pts = smoothPath(grid, [start, ...raw.slice(1, -1), goal]);
    const p: Plan = { pts, len: pathLength(pts), wraps1: wrapsIn(pts, 0), wraps2: wrapsIn(pts, 1) };
    setPlan(p);
    return p;
  };
  const playPlan = (p: Plan) => {
    const cum = [0];
    for (let k = 1; k < p.pts.length; k++) cum.push(cum[k - 1] + Math.hypot(p.pts[k][0] - p.pts[k - 1][0], p.pts[k][1] - p.pts[k - 1][1]));
    const total = cum[cum.length - 1] || 1e-6;
    ghostStore.set([]);
    poseStore.set([wrap(p.pts[0][0]), wrap(p.pts[0][1])]);
    startAnim({ kind: 'path', pts: p.pts, cum, total, s: 0, speed: Math.max(1.4, total / 4.5), ghostEvery: total / 10, nextGhost: 0 });
  };

  // straight tip line (demo scene)
  const lineSamples = useMemo(() => {
    const L = scene.line;
    if (!L) return null;
    const out: { t: [number, number]; hit: boolean }[] = [];
    let prev: [number, number] | null = null;
    for (let k = 0; k <= 160; k++) {
      const f = k / 160;
      const sols = ik2(arm, { x: L.from.x + (L.to.x - L.from.x) * f, y: L.from.y + (L.to.y - L.from.y) * f });
      if (!sols.length) continue;
      const s = sols[0];
      const t: [number, number] = prev ? [prev[0] + wrapPi(s[0] - prev[0]), prev[1] + wrapPi(s[1] - prev[1])] : [s[0], s[1]];
      prev = t;
      const c = collisionsAt(arm, cols, t[0], t[1]);
      out.push({ t, hit: c.link1.length + c.link2.length > 0 });
    }
    return out;
  }, [scene.line, arm, cols]);
  const lineHits = lineSamples ? lineSamples.filter((s) => s.hit).length : 0;
  const lineFreeForTip = useMemo(() => {
    const L = scene.line;
    return !L || !cols.some((c) => segHits(L.from.x, L.from.y, L.to.x, L.to.y, c));
  }, [scene.line, cols]);
  const playLine = () => {
    if (!lineSamples || lineSamples.length < 2) return;
    ghostStore.set([]);
    setPlan(null);
    startAnim({ kind: 'line', samples: lineSamples, t: 0, dur: 3.2, nextGhost: 0 });
  };

  // ---------------------------------------------------------------- predict-then-reveal actions
  const scrollToSim = () => {
    const el = rootRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.top < -40 || r.top > window.innerHeight * 0.5) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const api = useRef<Record<string, () => void>>({});
  api.current = {
    band: () => {
      loadScene(sceneById('pr-band'), { select: 'A' });
      setExam(false);
      startAnim({ kind: 'keys', keys: [[0.75 * P, 0.05 * P], [0.75 * P, 1.95 * P]], t: 0, dur: 3 });
      scrollToSim();
    },
    above: () => {
      loadScene(sceneById('pr-above'), { select: 'B' });
      setExam(false);
      startAnim({ kind: 'keys', keys: [[0.5 * P, 1.62 * P], [0.5 * P, 2.38 * P]], t: 0, dur: 3 });
      scrollToSim();
    },
    shrink: () => {
      const s = sceneById('e2024');
      loadScene(s, { select: 'C' });
      setExam(false);
      startAnim({ kind: 'L1', from: s.ws.l1, to: 2.0, t: 0, dur: 1.8 });
      scrollToSim();
    },
    wrapEdges: () => {
      loadScene(sceneById('e2025'), { select: 'B' });
      setExam(false);
      startAnim({ kind: 'keys', keys: [[0.55 * P, 1.66 * P], [0.55 * P, 2.32 * P]], t: 0, dur: 3 });
      scrollToSim();
    },
    line: () => {
      loadScene(sceneById('line'));
      setExam(false);
      scrollToSim();
      // the IK samples need the new scene's state: start on the next frame
      window.setTimeout(() => api.current.playLineNow(), 50);
    },
    playLineNow: () => playLine(),
  };

  // ---------------------------------------------------------------- derived display
  const selInfo = sel ? obstacleInfo({ base: arm.base, l1, l2, obstacles: [] } as CWorkspace, sel.shape) : null;
  const planD = plan && plan !== 'none' ? cspacePolylines(plan.pts) : '';
  const lineD = useMemo(() => {
    if (!lineSamples) return { free: '', hit: '' };
    const seg = (want: boolean) => {
      let d = '';
      let prev: [number, number] | null = null;
      for (const s of lineSamples) {
        if (s.hit !== want) {
          prev = null;
          continue;
        }
        d += cspacePolylines(prev ? [prev, s.t] : [s.t]);
        prev = s.t;
      }
      return d;
    };
    return { free: seg(false), hit: seg(true) };
  }, [lineSamples]);

  const boxes: PaperBox[] = showBoxes && scene.boxes ? scene.boxes : [];
  const reach = l1 + l2;

  return (
    <div className="plan-cspace" ref={rootRef}>
      <div className="plan-cspace-toolbar">
        <Select
          label="Workspace"
          value={sceneId}
          options={sceneOptions}
          onChange={(id) => {
            if (id === 'random') return;
            loadScene(sceneById(id));
          }}
        />
        <Button onClick={newRandom} title="A new random exam-like workspace">
          🎲 Random
        </Button>
        {!locked && (
          <>
            <Button onClick={() => addObstacle('rect')} disabled={!freeLetter()} title="Add a square obstacle (up to four)">
              + Box
            </Button>
            <Button onClick={() => addObstacle('circle')} disabled={!freeLetter()} title="Add a disc">
              + Disc
            </Button>
            <Button onClick={() => addObstacle('tri')} disabled={!freeLetter()} title="Add a triangle">
              + Triangle
            </Button>
            <Button variant="danger" onClick={removeSelected} disabled={!sel} title={sel ? `Remove obstacle ${sel.label}` : 'Select an obstacle first'}>
              Remove{sel ? ` ${sel.label}` : ''}
            </Button>
          </>
        )}
      </div>
      <Rich className="plan-cspace-explain" text={scene.note} />

      <div className="plan-cspace-views" style={{ marginTop: 8 }}>
        <section className="plan-cspace-panel" aria-label="Workspace">
          <div className="plan-cspace-panel-head">
            <h4>Workspace</h4>
            <span className="muted small">{locked ? 'drag the elbow or the tip' : 'drag obstacles · the elbow · the tip'}</span>
          </div>
          <div className="plan-cspace-plotwrap">
            <svg
              ref={wsSvg}
              className="plan-cspace-svg"
              viewBox={`0 0 ${FR.W} ${FR.H}`}
              role="group"
              aria-label="Workspace: base at (5, 5); drag obstacles, the elbow or the tip"
              onPointerMove={onWsMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              onPointerDown={() => setSelId(null)}
            >
              <defs>
                <clipPath id="plan-cspace-wsclip">
                  <rect x={FR.L} y={FR.T} width={FR.S} height={FR.S} />
                </clipPath>
              </defs>
              <WsFrame />
              <g clipPath="url(#plan-cspace-wsclip)">
                {selInfo && sel && (
                  <path
                    d={`M${wsX(5)} ${wsY(5)}L${wsArcD({ x: 5, y: 5 }, 8, selInfo.dir[0], selInfo.dir[1]).slice(1)}Z`}
                    fill={exam ? 'var(--text-3)' : colorOfLabel(sel.label)}
                    opacity={0.12}
                    pointerEvents="none"
                  />
                )}
                <circle className="plan-cspace-reach" cx={wsX(5)} cy={wsY(5)} r={wsLen(reach)} />
                <circle className="plan-cspace-circle" cx={wsX(5)} cy={wsY(5)} r={wsLen(l1)} />
                {obs.map((o) => (
                  <g
                    key={o.id}
                    className={locked ? undefined : 'plan-cspace-drag'}
                    tabIndex={0}
                    role="button"
                    aria-label={`Obstacle ${o.label}${locked ? '' : ': drag or use the arrow keys to move it'}`}
                    aria-pressed={o.id === selId}
                    onPointerDown={(e) => onObsDown(o, e)}
                    onKeyDown={(e) => onObsKey(o, e)}
                  >
                    <circle cx={wsX(labelPoint(o.shape).x)} cy={wsY(labelPoint(o.shape).y)} r={20} fill="transparent" />
                    <ObstacleView s={o.shape} label={o.label} fill={exam ? 'var(--plan-cs-grey)' : colorOfLabel(o.label)} labelPos={labelPoint(o.shape)} className={exam ? 'plan-cspace-paper' : undefined} />
                    {o.id === selId && (o.shape.kind === 'circle' ? <circle className="plan-cspace-sel" cx={wsX(o.shape.x)} cy={wsY(o.shape.y)} r={wsLen(o.shape.r) + 4} /> : <path className="plan-cspace-sel" d={shapeD(o.shape)} />)}
                  </g>
                ))}
                {scene.line && (
                  <g pointerEvents="none">
                    <line x1={wsX(scene.line.from.x)} y1={wsY(scene.line.from.y)} x2={wsX(scene.line.to.x)} y2={wsY(scene.line.to.y)} stroke="var(--ok)" strokeWidth={2} strokeDasharray="7 5" />
                    <text className="plan-cspace-note" x={wsX(scene.line.from.x)} y={wsY(scene.line.from.y) - 9} textAnchor="middle">
                      P
                    </text>
                    <text className="plan-cspace-note" x={wsX(scene.line.to.x)} y={wsY(scene.line.to.y) - 9} textAnchor="middle">
                      Q
                    </text>
                  </g>
                )}
                {(plan || isChallenge) && (
                  <g pointerEvents="none">
                    {(
                      [
                        ['S', start],
                        ['G', goal],
                      ] as const
                    ).map(([lab, t]) => {
                      const q = armPoints({ base: arm.base, l1, l2, t1: t[0], t2: t[1] });
                      return (
                        <g key={lab}>
                          <ArmView pose={{ base: arm.base, l1, l2, t1: t[0], t2: t[1] }} c1="var(--text-3)" c2="var(--text-3)" w1={2.5} w2={2} arcs={false} opacity={0.6} />
                          <text className="plan-cspace-note" x={wsX(q.tip.x)} y={wsY(q.tip.y) - 8} textAnchor="middle" style={{ fontWeight: 700 }}>
                            {lab}
                          </text>
                        </g>
                      );
                    })}
                  </g>
                )}
                <WsGhosts store={ghostStore} arm={arm} />
                <WsArmLayer store={poseStore} arm={arm} cols={cols} grid={grid} labels={labels} sweep={sweep} exam={exam} onHandleDown={onHandleDown} />
              </g>
            </svg>
          </div>
          <div className="plan-cspace-legend" aria-hidden="true">
            <span>
              <i style={{ background: 'var(--text)' }} />
              link 1
            </span>
            <span>
              <i style={{ background: 'var(--text-2)' }} />
              link 2
            </span>
            <span>- - circle r = L₁ (link 1’s reach)</span>
            <span>··· r = L₁ + L₂ (tip’s reach)</span>
            {sweep && <span>circle round the elbow: every θ₂ (coloured where link 2 would hit)</span>}
          </div>
        </section>

        <section className="plan-cspace-panel" aria-label="Configuration space">
          <div className="plan-cspace-panel-head">
            <h4>Configuration space</h4>
            <span className="muted small">{isChallenge ? 'tap or drag: the arm moves in a straight line' : 'tap or drag to pose the arm'}</span>
          </div>
          <div className="plan-cspace-plotwrap">
            <div className="plan-cspace-cbox">
              <svg viewBox={`0 0 ${FR.W} ${FR.H}`} aria-hidden="true" style={{ pointerEvents: 'none' }}>
                <CsFrame />
              </svg>
              <canvas ref={canvasRef} width={N} height={N} aria-hidden="true" />
              <svg
                ref={csSvg}
                viewBox={`0 0 ${FR.W} ${FR.H}`}
                tabIndex={0}
                role="slider"
                aria-label={`Configuration space. Arrow keys move θ1 (left/right) and θ2 (up/down).`}
                aria-valuetext="Use the arrow keys to change the pose"
                onPointerDown={onCsDown}
                onPointerMove={onCsMove}
                onPointerUp={(e) => {
                  drag.current = null;
                  try {
                    e.currentTarget.releasePointerCapture(e.pointerId);
                  } catch {
                    /* not captured */
                  }
                }}
                onPointerCancel={() => (drag.current = null)}
                onKeyDown={onCsKey}
              >
                <CsGridOverlay />
                {selInfo && sel && (
                  <g pointerEvents="none">
                    {[0, -TAU, TAU].map((off) => (
                      <rect
                        key={off}
                        x={Math.max(FR.L, csX(selInfo.dir[0] + off))}
                        width={Math.max(0, Math.min(FR.L + FR.S, csX(selInfo.dir[1] + off)) - Math.max(FR.L, csX(selInfo.dir[0] + off)))}
                        y={FR.T + FR.S + 1}
                        height={4}
                        fill={exam ? 'var(--text-2)' : colorOfLabel(sel.label)}
                      />
                    ))}
                  </g>
                )}
                {lineSamples && (
                  <g pointerEvents="none">
                    <path d={lineD.free} fill="none" stroke="var(--ok)" strokeWidth={2.2} strokeDasharray="5 4" />
                    <path d={lineD.hit} fill="none" stroke="var(--bad)" strokeWidth={3} />
                  </g>
                )}
                {planD && <path d={planD} fill="none" stroke="var(--accent)" strokeWidth={2.6} strokeLinejoin="round" strokeLinecap="round" pointerEvents="none" />}
                <CsTrail store={trailStore} />
                {boxes.map((b, k) => {
                  const x = csX(b.t1 * P);
                  const y = csY(b.t2 * P);
                  const bx = Math.min(FR.L + FR.S - 26, x + 12);
                  const by = Math.max(FR.T + 2, y - 30);
                  return (
                    <g key={k} pointerEvents="none" className="plan-cspace-ansbox">
                      <line className="plan-cspace-leader" x1={x} y1={y} x2={bx + 12} y2={by + 20} />
                      <circle cx={x} cy={y} r={2.5} fill="var(--text)" />
                      <rect x={bx} y={by} width={24} height={20} rx={2} />
                      <text className="ans" x={bx + 12} y={by + 15} textAnchor="middle">
                        {b.answer}
                      </text>
                    </g>
                  );
                })}
                {(
                  [
                    ['S', start],
                    ['G', goal],
                  ] as const
                ).map(([lab, t]) => (
                  <g
                    key={lab}
                    className={isChallenge ? undefined : 'plan-cspace-drag'}
                    onPointerDown={(e) => onMarkDown(lab, e)}
                    role="img"
                    aria-label={`${lab === 'S' ? 'Start' : 'Goal'} at ${fmtPose(t)}${isChallenge ? '' : ': drag to move'}`}
                  >
                    <circle cx={csX(wrap(t[0]))} cy={csY(wrap(t[1]))} r={isChallenge ? 0 : 18} fill="transparent" />
                    <circle cx={csX(wrap(t[0]))} cy={csY(wrap(t[1]))} r={9} fill="var(--surface)" stroke="var(--text)" strokeWidth={2} />
                    <text x={csX(wrap(t[0]))} y={csY(wrap(t[1])) + 4} textAnchor="middle" style={{ font: '700 10.5px var(--font)', fill: 'var(--text)' }} pointerEvents="none">
                      {lab}
                    </text>
                  </g>
                ))}
                <CsDot store={poseStore} />
              </svg>
            </div>
          </div>
          <div className="plan-cspace-legend" aria-hidden="true">
            {exam ? (
              <span>
                <i style={{ background: 'var(--plan-cs-grey)' }} />
                exam look: every region grey, as on the paper
              </span>
            ) : (
              <>
                <span>
                  <i style={{ background: 'var(--text-2)' }} />
                  solid: link 1 hits (full-height band)
                </span>
                <span>
                  <i style={{ background: 'color-mix(in srgb, var(--text-2) 45%, transparent)' }} />
                  tint: only link 2 hits (blob, bulge)
                </span>
              </>
            )}
            <span>dashed line: this θ₁’s column = the circle round the elbow</span>
          </div>
        </section>
      </div>

      <PoseStatus store={poseStore} arm={arm} cols={cols} labels={labels} />

      <div className="plan-cspace-controls">
        <div className="plan-cspace-box">
          <h4>Arm</h4>
          <Slider label="link 1 length" tex="L_1" tip="length of link 1 (m) = radius of the dashed circle" value={l1} min={1} max={3.5} step={0.05} unit="m" onChange={(v) => !locked && setL1(v)} disabled={locked} />
          <Slider label="link 2 length" tex="L_2" tip="length of link 2 (m)" value={l2} min={0.5} max={3} step={0.05} unit="m" onChange={(v) => !locked && setL2(v)} disabled={locked} />
          <div className="plan-cspace-row">
            <Button
              onClick={() => {
                const [t1, t2] = poseStore.get();
                const tip = armPoints({ base: arm.base, l1, l2, t1, t2 }).tip;
                const sols = ik2(arm, tip);
                if (sols.length < 2) return;
                const other = wrap(t2) <= P ? sols[1] : sols[0];
                movePose([other[0], other[1]], { hop: true });
              }}
              title="Same tip position, the other inverse-kinematics solution (θ2 → 2π − θ2)"
            >
              Flip elbow
            </Button>
          </div>
          <Toggle checked={sweep} onChange={setSweep} label="Show every θ₂ at this θ₁ (circle round the elbow)" />
        </div>

        <div className="plan-cspace-box">
          <h4>{isChallenge ? 'Challenge' : 'Plan a motion'}</h4>
          {isChallenge ? (
            <>
              <p className="plan-cspace-explain" style={{ margin: 0 }}>
                Get from S to G without touching anything. Every move is a straight line in C-space, checked all the way: tap a point to hop there, drag the dot, or drag the elbow or the tip.
              </p>
              {chal.status === 'crashed' && (
                <Callout kind="bad" title="Crashed">
                  {chal.msg} The arm stops where it first touches. {chal.crashes >= 2 ? 'Hint: θ₁ = 0 and 2π are the same angle, so going left past the edge brings you in on the right.' : ''}
                </Callout>
              )}
              {chal.status === 'done' && (
                <Callout kind="ok" title="Done: collision-free">
                  Your route went round the torus instead of through A’s band. That is exactly what a C-space planner does.
                </Callout>
              )}
              {chalDone && chal.status !== 'done' && <p className="muted small" style={{ margin: 0 }}>✓ Challenge already completed. Do it again if you like.</p>}
              <div className="plan-cspace-row">
                <Button
                  variant="primary"
                  onClick={() => {
                    stopAnim();
                    poseStore.set(scene.start);
                    trailStore.set({ pts: [scene.start], crash: null });
                    ghostStore.set([]);
                    setPlan(null);
                    setChal((c) => ({ ...c, status: 'idle', msg: '' }));
                  }}
                >
                  {chal.status === 'idle' ? 'Back to S' : 'Try again from S'}
                </Button>
                {(chal.crashes >= 2 || chal.status === 'done') && (
                  <Button
                    onClick={() => {
                      const p = doPlan();
                      if (p !== 'none') playPlan(p);
                    }}
                  >
                    Show the planner’s route
                  </Button>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="plan-cspace-row">
                <Button onClick={() => setStart(poseStore.get())} title="Use the current pose as the start S">
                  S ← pose
                </Button>
                <Button onClick={() => setGoal(poseStore.get())} title="Use the current pose as the goal G">
                  G ← pose
                </Button>
                <Button
                  variant="primary"
                  disabled={!startFree || !goalFree}
                  onClick={() => {
                    const p = doPlan();
                    if (p !== 'none') playPlan(p);
                  }}
                >
                  Plan in C-space
                </Button>
                {plan && plan !== 'none' && (
                  <Button onClick={() => (playing ? stopAnim() : playPlan(plan))}>{playing && anim.current?.kind === 'path' ? '⏸ Pause' : '▶ Replay'}</Button>
                )}
                {(plan || ghostStore.get().length > 0) && (
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setPlan(null);
                      ghostStore.set([]);
                      stopAnim();
                    }}
                  >
                    Clear
                  </Button>
                )}
              </div>
              <Rich
                className="plan-cspace-explain"
                text={
                  !startFree || !goalFree
                    ? `**${!startFree ? 'S' : 'G'} is in collision.** Move it to a white cell (drag it in C-space, or pose the arm and press ${!startFree ? '“S ← pose”' : '“G ← pose”'}).`
                    : plan === 'none'
                      ? '**No collision-free path.** S and G are in separate free regions: full-height bands (or blobs) cut the torus in two, so no motion of the arm joins them.'
                      : plan
                        ? `Path found: ${fmt(plan.len / P, 3)}π rad of joint motion${plan.wraps1 ? `, **wrapping through $\\theta_1 = 0 \\equiv 2\\pi$**` : ''}${plan.wraps2 ? `${plan.wraps1 ? ' and' : ','} **through $\\theta_2 = 0 \\equiv 2\\pi$**` : ''}. Grey ghosts show the arm along the way.`
                        : `S = ${fmtPose(start)}, G = ${fmtPose(goal)}. Drag S and G in C-space, then plan: A* on the ${N} × ${N} grid, 8-connected, with the edges glued (a torus).`
                }
              />
              {scene.line && (
                <>
                  <div className="plan-cspace-row">
                    <Button onClick={playLine}>Slide the tip along P → Q</Button>
                  </div>
                  <Rich
                    className="plan-cspace-explain"
                    text={`The tip’s straight line is ${lineFreeForTip ? '**free**' : '**not free**'} (green dashes), but following it needs ${lineSamples ? `$\\theta_1$ from ${piTeX(wrap(lineSamples[0].t[0]))} to ${piTeX(wrap(lineSamples[lineSamples.length - 1].t[0]))}` : ''}: ${lineHits ? `**${Math.round((100 * lineHits) / (lineSamples?.length || 1))} % of it collides** (red in C-space).` : 'it happens to be collision-free now.'}`}
                  />
                </>
              )}
            </>
          )}
        </div>

        <div className="plan-cspace-box">
          <h4>Read the plot</h4>
          <Segmented
            size="sm"
            label="Colouring"
            value={exam ? 'exam' : 'colour'}
            onChange={(v) => setExam(v === 'exam')}
            options={[
              { value: 'colour', label: 'Colour per obstacle' },
              { value: 'exam', label: 'Exam look (grey)' },
            ]}
          />
          {scene.boxes && <Toggle checked={showBoxes} onChange={setShowBoxes} label="Show the paper’s answer boxes" />}
          {sel && selInfo ? (
            <Rich
              className="plan-cspace-explain"
              text={
                selInfo.band
                  ? `**${sel.label}**: nearest point ${fmt(selInfo.dNear, 3)} m from the base, inside $L_1$ = ${fmt(l1, 3)} m, so link 1 reaches it: a **full-height band** wherever link 1 points into it. That is inside the directions it covers from the base, $\\theta_1 \\approx$ ${piTeX(selInfo.dir[0])} to ${piTeX(selInfo.dir[1])} (marked under the axis)${selInfo.dFar > l1 + 1e-9 ? ', and narrower when part of it lies beyond the circle' : ''}, with link-2 bulges at the sides.`
                  : selInfo.reachable
                    ? `**${sel.label}**: nearest point ${fmt(selInfo.dNear, 3)} m from the base, beyond $L_1$ = ${fmt(l1, 3)} m but within $L_1 + L_2$ = ${fmt(reach, 3)} m: only link 2 reaches it, so an **isolated blob** near $\\theta_2 \\approx 0 \\equiv 2\\pi$ at $\\theta_1 \\approx$ ${piTeX(selInfo.dir[0])} to ${piTeX(selInfo.dir[1])}, its directions from the base.`
                    : `**${sel.label}**: nearest point ${fmt(selInfo.dNear, 3)} m from the base, beyond $L_1 + L_2$ = ${fmt(reach, 3)} m: the arm cannot reach it, so it has **no C-space region** at all.`
              }
            />
          ) : (
            <p className="plan-cspace-explain" style={{ margin: 0 }}>
              Tap an obstacle (or a coloured region) to see why its region is a band or a blob.
            </p>
          )}
        </div>
      </div>

      <PredictBlock api={api} />

      <More label="How to read a 2-link C-space plot in the exam (summary notes §5)">
        <Rich
          text={`1. Draw the circle of radius $L_1$ round the base: link 1 can only touch what is inside it.
2. An obstacle that crosses the circle is hit by link 1 **whatever** $\\theta_2$ is: a full-height vertical band over the $\\theta_1$ range pointing at it, with bulges where link 2 also hits it.
3. An obstacle outside the circle can only be hit by link 2: an isolated blob near $\\theta_2 \\approx 0 \\equiv 2\\pi$ (arm nearly straight) at $\\theta_1 \\approx$ the obstacle's direction from the base. It wraps between the top and bottom edges, so it shows as two pieces.
4. Verify one point with forward kinematics and check the tip (or a link) lands in the obstacle:

$$\\text{elbow} = \\text{base} + L_1(\\cos\\theta_1, \\sin\\theta_1), \\qquad \\text{tip} = \\text{elbow} + L_2\\big(\\cos(\\theta_1+\\theta_2), \\sin(\\theta_1+\\theta_2)\\big)$$

Why plan here at all? In C-space the whole arm is one point, so "is this motion collision-free?" becomes "does this curve avoid the grey regions?", and any graph search (A*, RRT) works on it. A straight line in the workspace says nothing about the links (review deck slide 15).`}
        />
        <div className="plan-cspace-row" style={{ marginTop: 8 }}>
          <LinkButton href={href(['plan', 'solve', 'plan-cspace'], { t: 2 })} variant="primary">
            Practise: label a C-space (exam style)
          </LinkButton>
        </div>
      </More>
    </div>
  );
}

// ------------------------------------------------------------------ predict-then-reveal (memoised: never re-renders with the sim)

const PredictBlock = memo(function PredictBlock({ api }: { api: MutableRefObject<Record<string, () => void>> }) {
  return (
    <div className="plan-cspace-predicts">
      <PredictReveal
        id="plan-cspace-band"
        question="Square A crosses the dashed circle of radius $L_1$. In C-space, is its region a full-height band or an isolated blob?"
        options={['A full-height band over the $\\theta_1$ values that point at A', 'An isolated blob near $\\theta_2 \\approx 0$, where the arm is stretched out towards A', 'A horizontal band: one value of $\\theta_2$ collides at every $\\theta_1$', 'No region at all: A sits too close to the base for the arm to hit it']}
        answer={0}
        explain="Link 1 sweeps the whole disc of radius $L_1$. When $\theta_1$ points at the part of A inside that disc, link 1 is already inside A, so the arm collides **whatever $\theta_2$ is**: the whole column of C-space is blocked, a full-height band. Its width is the range of directions in which link 1 reaches A: about $0.70\pi$ to $0.80\pi$ here. (A as a whole spans $0.67\pi$ to $0.83\pi$ from the base, but its outer corners lie beyond $L_1$, so link 1 misses them.) The tinted bulges at the sides of the band are link 2 hitting A when link 1 points just past it."
        tryIt="press Show me: the arm sweeps θ₂ all the way round with link 1 pointing at A."
        onApply={() => api.current.band()}
      />
      <PredictReveal
        id="plan-cspace-above"
        question="Block B is directly above the base and beyond the dashed circle (out of reach of link 1). Near which $(\theta_1, \theta_2)$ is its C-space blob?"
        options={['$\\theta_1 \\approx \\pi/2$, $\\theta_2 \\approx 0 \\equiv 2\\pi$ (pointing up, nearly straight)', '$\\theta_1 \\approx \\pi/2$, $\\theta_2 \\approx \\pi$ (pointing up, elbow folded back)', '$\\theta_1 \\approx 0$, $\\theta_2 \\approx \\pi/2$ (pointing right, then bent up to B)', 'A full-height band at $\\theta_1 \\approx \\pi/2$ (every $\\theta_2$ collides)']}
        answer={0}
        explain="Only link 2 can touch B, and only when the arm is nearly straight ($\theta_2 \approx 0$) and pointing at B ($\theta_1 \approx$ B's direction from the base, $\pi/2$). Bending the elbow pulls the tip back out of reach, so the blob is small and centred on $\theta_2 = 0$. Because $\theta_2 = 0$ and $2\pi$ are the same angle, the plot cuts it into two pieces, one on the bottom edge and one on the top."
        tryIt="press Show me: the dot climbs through the top edge at θ₁ = π/2 and comes back in at the bottom, the tip inside B all the way."
        onApply={() => api.current.above()}
      />
      <PredictReveal
        id="plan-cspace-shrink"
        question="In the 2024 workspace, C crosses the circle and makes a narrow band. Shrink $L_1$ from 2.83 m to 2.0 m so the circle no longer reaches C. What happens to C's region?"
        options={['It becomes an isolated blob: only link 2 can reach C now', 'It stays a full-height band, only narrower, because C has not moved', 'It disappears: with a shorter link 1 the arm can no longer reach C', 'It moves to a different $\\theta_1$, since the elbow is now nearer the base']}
        answer={0}
        explain="C's nearest corner is 2.24 m from the base. With $L_1$ = 2 m link 1 stops short of it, so no column is blocked for every $\theta_2$: the band lets go of the top and bottom edges and only the link-2 part is left, a blob near $\theta_2 \approx 0$. It does not vanish, because $L_1 + L_2$ = 4 m still reaches C. A, whose near edge is only 1 m away, keeps its band."
        tryIt="press Show me and watch C's band (green) as L₁ shrinks."
        onApply={() => api.current.shrink()}
      />
      <PredictReveal
        id="plan-cspace-wrap-edges"
        question="A region runs off the top edge of the C-space plot ($\theta_2 = 2\pi$). Where does it continue?"
        options={['At the bottom edge, at the same $\\theta_1$', 'At the left edge, because the plot wraps round sideways', 'Nowhere: the region simply ends at the edge of the plot', 'At the top edge again, half a turn away in $\\theta_1$']}
        answer={0}
        explain="$\theta_2 = 2\pi$ and $\theta_2 = 0$ are the same joint angle, so the top and bottom edges are glued together (and so are the left and right edges): the C-space of a two-revolute arm is a torus. A blob near $\theta_2 \approx 0$ shows as two pieces, one on each edge. That is why 2023 Q26 and 2025 Q25 have two boxes for the same obstacle."
        tryIt="press Show me: in the 2025 workspace the pose climbs through the top edge; the tip stays inside B."
        onApply={() => api.current.wrapEdges()}
      />
      <PredictReveal
        id="plan-cspace-line"
        question="The tip can slide along the dashed straight line from P to Q without touching A. Can the arm make that motion without a collision?"
        options={['Yes: the tip’s straight line is free, so the arm’s motion is free too', 'No: on the way, link 1 has to point at A and hits it', 'Yes, as long as the arm uses the other elbow (IK) solution']}
        answer={1}
        explain="The tip's path is not the arm's path: the links sweep an area. A crosses the circle, so it is a full-height band, and following the line takes $\theta_1$ from about $0.18\pi$ to $0.70\pi$, straight through the band, with either elbow solution. The only collision-free motion goes the other way round (through $\theta_1 = 0 \equiv 2\pi$), which is what the C-space planner finds (review deck slide 15)."
        tryIt="press Show me: the arm follows the line; red ghosts and the red stretch in C-space are collisions. Then press Plan in C-space."
        onApply={() => api.current.line()}
      />
    </div>
  );
});
