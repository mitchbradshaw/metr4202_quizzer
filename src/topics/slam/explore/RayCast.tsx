// Lidar ray-cast grid builder (summary notes §4: occupancy grids and practical mapping issues; Probabilistic Robotics
// Tables 9.1-9.2). A robot with a KNOWN pose scans a hidden office with a 360° lidar; every beam adds l_free to the
// cells it crosses, l_occ to the cell where it returns and nothing beyond. The map is a canvas (ImageData, grey =
// unknown, light = free, dark = occupied). Scans are logged as poses + times + noise seeds, so changing the inverse
// sensor model, the lidar or the cell size rebuilds the map from the same drive (double-buffered, so no flicker).
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent as RPointerEvent } from 'react';
import type { ExploreItem } from '../../../engine/types';
import { BELIEF_L, gridBytes, integrateScan, isGhost, lo, makeGrid, mapStats, takeScan, truthGrid, type InverseSensor, type LidarSpec, type MapStats, type OccGrid, type Scan } from '../../../core/slamgrid';
import { mulberry32 } from '../../../engine/rng';
import { Button, Callout, More, Readout, Readouts, Segmented, Slider, Toggle } from '../../../ui/kit';
import { PredictReveal } from '../../../ui/PredictReveal';
import { Rich } from '../../../ui/Rich';
import { useRaf, useWidth } from '../../../anim/hooks';
import { mixRgb, rgbOf, useThemeColors } from '../../../ui/theme';
import { FREE_C, OCC_C, revealEl, sgn, useStickyFit } from './slamCommon';
import { LABELS, OFFICE, SCENES, WORLD_H, WORLD_W, personAt, routeAt, type SceneId } from './raycastScenes';

export const meta: Omit<ExploreItem, 'component'> = {
  id: 'raycast',
  title: 'Lidar ray-cast grid builder',
  summary:
    'A robot with a known pose scans a hidden office with a 360° lidar. Every beam updates the log-odds of the cells it crosses: free along the way, occupied where it returns, nothing beyond. Tune the inverse sensor model, the beams, the noise and the cell size, then break the assumptions with a person walking through, a glass wall and a coarse grid.',
  notice:
    'A beam adds $l_\\text{free}$ to every cell it crosses, $l_\\text{occ}$ to the cell where it returns and nothing behind it: shadows stay grey, glass reads as free, and a person who stops leaves a ghost obstacle.',
  minutes: 10,
};

const SCAN_HZ = 5;
const SPEED = 1.2; // m/s along a route
const MAX_LOG = 3000;
const CLAMP_P: [number, number] = [0.12, 0.97];
const GLASS_COS = Math.cos((8 * Math.PI) / 180);
const RESOLUTIONS = [0.05, 0.1, 0.2, 0.5];
const PRERUN_M = 9.5;

interface Rec {
  x: number;
  y: number;
  th: number;
  t: number;
  seed: number;
}
interface Params {
  res: number;
  person: boolean;
  ism: InverseSensor;
  spec: LidarSpec;
}
interface Build {
  grid: OccGrid;
  cursor: number;
  params: Params;
  key: string;
}
interface Sim {
  t: number;
  s: number;
  nextScan: number;
  x: number;
  y: number;
  th: number;
  manual: boolean;
}
interface Info {
  stats: MapStats;
  scans: number;
  t: number;
  full: boolean;
  building: boolean;
}

function makeParams(o: { res: number; person: boolean; pHit: number; pPass: number; clamp: boolean; beams: number; sigma: number; maxRange: number; maxPolicy: 'clear' | 'ignore' }): Params {
  return {
    res: o.res,
    person: o.person,
    ism: {
      lOcc: lo(o.pHit),
      lFree: lo(o.pPass),
      lMin: o.clamp ? lo(CLAMP_P[0]) : -Infinity,
      lMax: o.clamp ? lo(CLAMP_P[1]) : Infinity,
      maxPolicy: o.maxPolicy,
    },
    spec: { beams: o.beams, maxRange: o.maxRange, sigma: o.sigma, glassCos: GLASS_COS },
  };
}
const keyOf = (p: Params) => [p.res, p.person, p.ism.lOcc, p.ism.lFree, p.ism.lMin, p.ism.lMax, p.ism.maxPolicy, p.spec.beams, p.spec.maxRange, p.spec.sigma].join('|');
const newBuild = (p: Params): Build => ({ grid: makeGrid(WORLD_W, WORLD_H, p.res), cursor: 0, params: p, key: keyOf(p) });
/**
 * A spinning lidar is not synchronised with the scans: each scan starts at a random fraction of the beam spacing,
 * so a parked robot still fills the gaps between its beams over a few scans.
 */
const simulate = (r: Rec, p: Params): Scan => {
  const rng = mulberry32(r.seed);
  const jitter = (rng() - 0.5) * ((2 * Math.PI) / Math.max(1, p.spec.beams));
  return takeScan(OFFICE, p.person ? [personAt(r.t)] : [], r.x, r.y, p.spec, rng, r.th + jitter);
};
const seedOf = (k: number) => (Math.imul(k + 1, 2654435761) ^ 0x5bd1e995) >>> 0;

function fmtBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(b < 102400 ? 1 : 0)} kB`;
  if (b < 1024 ** 3) return `${(b / 1024 ** 2).toFixed(1)} MB`;
  return `${(b / 1024 ** 3).toFixed(1)} GB`;
}

const COLOR_VARS = ['--surface', '--text', '--text-3', '--m1', '--m2', '--m4', '--accent', '--bad'] as const;
type Colors = Record<(typeof COLOR_VARS)[number], string>;
type RGB = [number, number, number];

/** Map colours that keep "light = free, dark = occupied, grey = unknown" in both themes (dimmed in the dark one). */
function mapPalette(c: Colors): { free: RGB; occ: RGB; unknown: RGB } {
  const s = rgbOf(c['--surface']);
  const t = rgbOf(c['--text']);
  const lum = (x: RGB) => 0.2126 * x[0] + 0.7152 * x[1] + 0.0722 * x[2];
  const dark = lum(s) < lum(t);
  const light: RGB = dark ? t : s;
  const black: RGB = dark ? s : t;
  const free = dark ? mixRgb(light, black, 0.2) : light;
  const occ = dark ? mixRgb(black, light, 0.03) : black;
  return { free, occ, unknown: mixRgb(free, occ, 0.5) };
}
const css = (c: RGB) => `rgb(${Math.round(c[0])}, ${Math.round(c[1])}, ${Math.round(c[2])})`;

export default function RayCast() {
  const [sceneId, setSceneId] = useState<SceneId>('tour');
  const scene = SCENES[sceneId];
  const [pHit, setPHit] = useState(0.7);
  const [pPass, setPPass] = useState(0.4);
  const [clamp, setClamp] = useState(true);
  const [beams, setBeams] = useState(180);
  const [sigma, setSigma] = useState(0.03);
  const [maxRange, setMaxRange] = useState(8);
  const [maxPolicy, setMaxPolicy] = useState<'clear' | 'ignore'>('clear');
  const [res, setRes] = useState(0.1);
  const [showTruth, setShowTruth] = useState(true);
  const [showBeams, setShowBeams] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(2);
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<Info | null>(null);
  const [flash, setFlash] = useState(false);

  const rootRef = useRef<HTMLDivElement>(null);
  const leftRef = useRef<HTMLDivElement>(null);
  const cv = useRef<HTMLCanvasElement>(null);
  const [wrapRef, cssW] = useWidth<HTMLDivElement>(700);
  const mapCv = useRef<HTMLCanvasElement | null>(null);
  const img = useRef<ImageData | null>(null);
  const log = useRef<Rec[]>([]);
  const live = useRef<Build | null>(null);
  const pending = useRef<Build | null>(null);
  const truth = useRef<{ res: number; t: Uint8Array } | null>(null);
  const lastScan = useRef<Scan | null>(null);
  const dirty = useRef(true);
  const lastInfo = useRef(0);
  const drag = useRef<number | null>(null);
  const sim = useRef<Sim>({ t: 0, s: 0, nextScan: 0, ...SCENES.tour.start, manual: false });
  const sceneRef = useRef(scene);
  sceneRef.current = scene;
  const unstuck = useStickyFit(leftRef);

  const params = useMemo(() => makeParams({ res, person: scene.person, pHit, pPass, clamp, beams, sigma, maxRange, maxPolicy }), [res, scene.person, pHit, pPass, clamp, beams, sigma, maxRange, maxPolicy]);
  const key = keyOf(params);

  const colors = useThemeColors(COLOR_VARS) as Colors;
  const pal = useMemo(() => mapPalette(colors), [colors]);
  const colorsRef = useRef(colors);
  colorsRef.current = colors;
  const lut = useMemo(() => {
    const out = new Uint8ClampedArray(256 * 3);
    for (let i = 0; i < 256; i++) {
      const c = mixRgb(pal.free, pal.occ, i / 255);
      out[i * 3] = c[0];
      out[i * 3 + 1] = c[1];
      out[i * 3 + 2] = c[2];
    }
    return out;
  }, [pal]);
  const lutRef = useRef(lut);
  lutRef.current = lut;

  const kick = () => setBusy(true);

  // ---------------------------------------------------------------- recording and integrating
  const record = (): boolean => {
    if (log.current.length >= MAX_LOG) return false;
    const s = sim.current;
    log.current.push({ x: s.x, y: s.y, th: s.th, t: s.t, seed: seedOf(log.current.length) });
    return true;
  };

  /** Integrate logged scans within a time budget; returns true while work remains. */
  const work = (budgetMs: number): boolean => {
    const L = log.current;
    const target = pending.current ?? live.current;
    if (!target) return false;
    const t0 = performance.now();
    let last: Scan | null = null;
    while (target.cursor < L.length && performance.now() - t0 < budgetMs) {
      const scan = simulate(L[target.cursor], target.params);
      integrateScan(target.grid, target.params.ism, scan);
      target.cursor++;
      if (target.cursor === L.length) last = scan;
    }
    if (pending.current && pending.current.cursor >= L.length) {
      live.current = pending.current;
      pending.current = null;
      dirty.current = true;
      lastScan.current = L.length ? last ?? simulate(L[L.length - 1], live.current.params) : null;
    } else if (!pending.current && last) {
      dirty.current = true;
      lastScan.current = last;
    }
    const Lv = live.current;
    if (Lv && (!truth.current || truth.current.res !== Lv.params.res)) truth.current = { res: Lv.params.res, t: truthGrid(OFFICE, Lv.grid) };
    return !!pending.current || (live.current ? live.current.cursor < L.length : false);
  };

  // ---------------------------------------------------------------- drawing
  const paintMap = () => {
    const Lv = live.current;
    if (!Lv) return;
    const g = Lv.grid;
    let c = mapCv.current;
    if (!c) {
      c = document.createElement('canvas');
      mapCv.current = c;
    }
    if (c.width !== g.nx || c.height !== g.ny) {
      c.width = g.nx;
      c.height = g.ny;
      img.current = null;
    }
    const ctx = c.getContext('2d');
    if (!ctx) return;
    if (!img.current) img.current = ctx.createImageData(g.nx, g.ny);
    const d = img.current.data;
    const tab = lutRef.current;
    const { nx, ny, l } = g;
    for (let iy = 0; iy < ny; iy++) {
      const row = (ny - 1 - iy) * nx;
      for (let ix = 0; ix < nx; ix++) {
        const v = l[iy * nx + ix];
        const q = v === 0 ? 128 : Math.round(255 / (1 + Math.exp(-v)));
        const p = (row + ix) * 4;
        d[p] = tab[q * 3];
        d[p + 1] = tab[q * 3 + 1];
        d[p + 2] = tab[q * 3 + 2];
        d[p + 3] = 255;
      }
    }
    ctx.putImageData(img.current, 0, 0);
  };

  const draw = () => {
    const c = cv.current;
    if (!c) return;
    const W = cssW;
    const H = Math.round((W * WORLD_H) / WORLD_W);
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) {
      c.width = Math.round(W * dpr);
      c.height = Math.round(H * dpr);
    }
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const k = W / WORLD_W;
    const X = (x: number) => x * k;
    const Y = (y: number) => H - y * k;
    const col = colorsRef.current;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const Lv = live.current;
    if (mapCv.current && Lv) {
      ctx.imageSmoothingEnabled = false;
      const gw = Lv.grid.nx * Lv.grid.res * k;
      const gh = Lv.grid.ny * Lv.grid.res * k;
      ctx.drawImage(mapCv.current, 0, H - gh, gw, gh);
    }
    const sc = sceneRef.current;
    // where the map disagrees with the hidden truth: ghost obstacles, and glass believed free
    const tg = truth.current;
    if (showTruth && Lv && tg && tg.res === Lv.params.res) {
      const g2 = Lv.grid;
      const cs = g2.res * k;
      ctx.strokeStyle = col['--bad'];
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      for (let kk = 0; kk < g2.l.length; kk++) {
        const v = g2.l[kk];
        if (v > BELIEF_L ? isGhost(g2, tg.t, kk) : v < -BELIEF_L && tg.t[kk] === 2) {
          const ix = kk % g2.nx;
          const iy = (kk - ix) / g2.nx;
          ctx.rect(ix * cs - 0.5, H - (iy + 1) * cs - 0.5, cs + 1, cs + 1);
        }
      }
      ctx.stroke();
    }
    // beams of the latest scan
    const s = lastScan.current;
    if (showBeams && s) {
      const n = s.ranges.length;
      ctx.lineWidth = 1;
      ctx.globalAlpha = n > 200 ? 0.16 : 0.26;
      ctx.strokeStyle = col['--m1'];
      ctx.beginPath();
      const maxB: number[] = [];
      for (let i = 0; i < n; i++) {
        if (s.kinds[i] === 'max') {
          maxB.push(i);
          continue;
        }
        const a = s.angle0 + (2 * Math.PI * i) / n;
        ctx.moveTo(X(s.x), Y(s.y));
        ctx.lineTo(X(s.x + s.ranges[i] * Math.cos(a)), Y(s.y + s.ranges[i] * Math.sin(a)));
      }
      ctx.stroke();
      if (maxB.length) {
        ctx.globalAlpha = 0.35;
        ctx.strokeStyle = col['--text-3'];
        ctx.setLineDash([3, 4]);
        ctx.beginPath();
        for (const i of maxB) {
          const a = s.angle0 + (2 * Math.PI * i) / n;
          ctx.moveTo(X(s.x), Y(s.y));
          ctx.lineTo(X(s.x + s.ranges[i] * Math.cos(a)), Y(s.y + s.ranges[i] * Math.sin(a)));
        }
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.globalAlpha = 0.95;
      ctx.fillStyle = col['--m2'];
      for (let i = 0; i < n; i++) {
        if (s.kinds[i] === 'max') continue;
        const a = s.angle0 + (2 * Math.PI * i) / n;
        ctx.fillRect(X(s.x + s.ranges[i] * Math.cos(a)) - 1.5, Y(s.y + s.ranges[i] * Math.sin(a)) - 1.5, 3, 3);
      }
      ctx.globalAlpha = 1;
    }
    // the hidden truth
    if (showTruth) {
      ctx.strokeStyle = col['--m4'];
      ctx.lineWidth = 1.4;
      ctx.globalAlpha = 0.6;
      for (const g of OFFICE.segs) {
        ctx.setLineDash(g.kind === 'glass' ? [7, 4] : []);
        ctx.lineWidth = g.kind === 'glass' ? 2.2 : 1.4;
        ctx.beginPath();
        ctx.moveTo(X(g.ax), Y(g.ay));
        ctx.lineTo(X(g.bx), Y(g.by));
        ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.fillStyle = col['--m4'];
      ctx.font = '11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      for (const lab of LABELS) ctx.fillText(lab.text, X(lab.x), Y(lab.y) + 4);
      ctx.globalAlpha = 1;
    }
    // the person (part of the truth the map does not know about)
    if (sc.person) {
      const p = personAt(sim.current.t);
      ctx.fillStyle = col['--m4'];
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.arc(X(p.x), Y(p.y), p.r * k, 0, 2 * Math.PI);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.font = '600 11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('person', X(p.x), Y(p.y) - p.r * k - 5);
    }
    // the robot (known pose)
    const r = sim.current;
    const rr = Math.max(6, 0.2 * k);
    ctx.fillStyle = col['--accent'];
    ctx.strokeStyle = col['--surface'];
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(X(r.x), Y(r.y), rr, 0, 2 * Math.PI);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(X(r.x), Y(r.y));
    ctx.lineTo(X(r.x) + rr * 1.7 * Math.cos(r.th), Y(r.y) - rr * 1.7 * Math.sin(r.th));
    ctx.strokeStyle = col['--accent'];
    ctx.lineWidth = 3;
    ctx.stroke();
  };

  const pushInfo = (force = false) => {
    const now = performance.now();
    if (!force && now - lastInfo.current < 250) return;
    lastInfo.current = now;
    const Lv = live.current;
    if (!Lv || !truth.current) return;
    setInfo({ stats: mapStats(Lv.grid, truth.current.t), scans: log.current.length, t: sim.current.t, full: log.current.length >= MAX_LOG, building: !!pending.current });
  };

  // ---------------------------------------------------------------- the loop
  const advance = (dts: number) => {
    const s = sim.current;
    const sc = sceneRef.current;
    s.t += dts;
    const route = !s.manual ? sc.route : null;
    if (route) {
      s.s = Math.min(route.length, s.s + SPEED * dts);
      const p = routeAt(route, s.s);
      s.x = p.x;
      s.y = p.y;
      s.th = p.th;
    }
    while (s.t >= s.nextScan) {
      if (!record()) {
        setPlaying(false);
        break;
      }
      s.nextScan += 1 / SCAN_HZ;
    }
    if (route && s.s >= route.length && !sc.person) setPlaying(false);
  };

  useRaf(
    (dt) => {
      if (playing) advance(dt * speed);
      const more = work(7);
      if (dirty.current) {
        paintMap();
        dirty.current = false;
      }
      draw();
      pushInfo(!more && !playing);
      if (!playing && !more && drag.current === null) setBusy(false);
    },
    playing || busy,
    rootRef
  );

  // Parameters changed: rebuild the map from the logged drive into a fresh grid, swapping when it has caught up.
  useEffect(() => {
    const Lv = live.current;
    if (Lv && Lv.key === key) {
      pending.current = null;
      return;
    }
    if (pending.current?.key === key) return;
    pending.current = newBuild(params);
    kick();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // Redraw on resize, toggles and theme changes.
  useEffect(() => {
    dirty.current = true;
    kick();
  }, [cssW, showTruth, showBeams, lut]);

  // ---------------------------------------------------------------- scenes
  const load = (id: SceneId, o: { play?: boolean; clamp?: boolean; res?: number; park?: { x: number; y: number; th: number }; scans?: number; prerun?: number } = {}) => {
    const sc = SCENES[id];
    const r = o.res ?? sc.res ?? (id === sceneId ? res : 0.1);
    const cl = o.clamp ?? clamp;
    setSceneId(id);
    setRes(r);
    setClamp(cl);
    const p = makeParams({ res: r, person: sc.person, pHit, pPass, clamp: cl, beams, sigma, maxRange, maxPolicy });
    log.current = [];
    live.current = newBuild(p);
    pending.current = null;
    lastScan.current = null;
    const start = o.park ?? sc.start;
    sim.current = { t: 0, s: 0, nextScan: 0, x: start.x, y: start.y, th: start.th, manual: !!o.park };
    sceneRef.current = sc;
    if (o.scans) {
      for (let i = 0; i < o.scans; i++) {
        record();
        sim.current.t += 1 / SCAN_HZ;
      }
      sim.current.nextScan = sim.current.t;
    } else if (o.prerun && sc.route) {
      const s = sim.current;
      while (s.s < o.prerun) {
        record();
        s.t += 1 / SCAN_HZ;
        s.s = Math.min(sc.route.length, s.s + SPEED / SCAN_HZ);
        const q = routeAt(sc.route, s.s);
        s.x = q.x;
        s.y = q.y;
        s.th = q.th;
      }
      s.nextScan = s.t;
    } else {
      record();
      sim.current.nextScan = 1 / SCAN_HZ;
    }
    dirty.current = true;
    setPlaying(!!o.play);
    kick();
  };

  // First visit: a third of the tour already driven, so the map is half built.
  useLayoutEffect(() => {
    load('tour', { prerun: PRERUN_M });
    work(Infinity);
    paintMap();
    dirty.current = false;
    draw();
    pushInfo(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const clearMap = () => {
    log.current = [];
    live.current = newBuild(params);
    pending.current = null;
    lastScan.current = null;
    sim.current.nextScan = sim.current.t;
    record();
    sim.current.nextScan = sim.current.t + 1 / SCAN_HZ;
    dirty.current = true;
    kick();
  };

  // ---------------------------------------------------------------- dragging the robot
  const toWorld = (e: RPointerEvent<HTMLCanvasElement>) => {
    const b = e.currentTarget.getBoundingClientRect();
    const k = b.width / WORLD_W;
    return { x: (e.clientX - b.left) / k, y: (b.bottom - e.clientY) / k };
  };
  const moveRobot = (x: number, y: number, force = false) => {
    const s = sim.current;
    const nx = Math.max(0.5, Math.min(WORLD_W - 0.5, x));
    const ny = Math.max(0.5, Math.min(WORLD_H - 0.5, y));
    const dx = nx - s.x;
    const dy = ny - s.y;
    if (Math.hypot(dx, dy) > 0.02) s.th = Math.atan2(dy, dx);
    s.x = nx;
    s.y = ny;
    s.manual = true;
    const L = log.current;
    const last = L[L.length - 1];
    if (force || !last || Math.hypot(last.x - nx, last.y - ny) >= 0.1) record();
    kick();
  };
  const onDown = (e: RPointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    setPlaying(false);
    drag.current = e.pointerId;
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = toWorld(e);
    moveRobot(p.x, p.y, true);
  };
  const onMove = (e: RPointerEvent<HTMLCanvasElement>) => {
    if (drag.current !== e.pointerId) return;
    const p = toWorld(e);
    moveRobot(p.x, p.y);
  };
  const onUp = () => {
    drag.current = null;
    kick();
  };
  const onKey = (e: KeyboardEvent<HTMLCanvasElement>) => {
    const d: Record<string, [number, number]> = { ArrowLeft: [-0.2, 0], ArrowRight: [0.2, 0], ArrowUp: [0, 0.2], ArrowDown: [0, -0.2] };
    const v = d[e.key];
    if (!v) return;
    e.preventDefault();
    setPlaying(false);
    moveRobot(sim.current.x + v[0], sim.current.y + v[1], true);
  };

  const togglePlay = () => {
    if (playing) {
      setPlaying(false);
      return;
    }
    const s = sim.current;
    const sc = sceneRef.current;
    if (sc.route && !s.manual && s.s >= sc.route.length && !sc.person) {
      load(sceneId, { play: true });
      return;
    }
    if (log.current.length >= MAX_LOG) return;
    s.nextScan = Math.max(s.nextScan, s.t);
    setPlaying(true);
  };

  const show = (fn: () => void) => {
    fn();
    revealEl(leftRef.current, '.slam-rc-map');
  };
  /**
   * The person and glass predictions quote numbers for the default inverse sensor model and lidar, so their
   * "Show me" puts those back (the map then rebuilds from the same drive).
   */
  const defaultSensor = () => {
    setPHit(0.7);
    setPPass(0.4);
    setBeams(180);
    setSigma(0.03);
    setMaxRange(8);
    setMaxPolicy('clear');
  };

  // ---------------------------------------------------------------- derived numbers
  const g = live.current?.grid;
  const nx = Math.ceil(WORLD_W / res - 1e-9);
  const ny = Math.ceil(WORLD_H / res - 1e-9);
  const bytes = gridBytes(nx, ny);
  const lOcc = lo(pHit);
  const lFree = lo(pPass);
  const st = info?.stats;
  const hitsToCertain = Math.ceil(lo(0.95) / lOcc - 1e-9);
  const passesToUndo = Math.ceil(lOcc / -lFree - 1e-9);
  const routeDone = !!scene.route && !sim.current.manual && sim.current.s >= scene.route.length && !scene.person;
  const H = Math.round((cssW * WORLD_H) / WORLD_W);

  // ---------------------------------------------------------------- left: the map
  const left = (
    <div className={`slam-left slam-panel${unstuck ? ' is-unstuck' : ''}`} ref={leftRef}>
      <div className="slam-bar">
        <Button size="sm" variant="primary" onClick={togglePlay} disabled={!!info?.full && !playing} title={scene.route && !sim.current.manual ? 'Drive the route and scan' : 'Let time run and scan from here'}>
          {playing ? '⏸ Pause' : routeDone ? '↻ Replay' : scene.route && !sim.current.manual ? '▶ Drive' : '▶ Scan'}
        </Button>
        <Segmented size="sm" label="Playback speed" value={speed} onChange={setSpeed} options={[1, 2, 4].map((v) => ({ value: v, label: `${v}×` }))} />
        <Button size="sm" onClick={() => load(sceneId, { play: true })} title="Start this scene again with an empty map">
          Restart
        </Button>
        <Button size="sm" onClick={clearMap} title="Forget the map but keep the robot where it is">
          Clear map
        </Button>
        <span className="slam-rc-status mono small muted" aria-live="polite">
          {`t = ${(info?.t ?? 0).toFixed(1)} s · ${info?.scans ?? 0} scans${info?.building ? ' · rebuilding' : ''}${info?.full ? ' · log full' : ''}`}
        </span>
      </div>
      <div ref={wrapRef} className="slam-rc-map">
        <canvas
          ref={cv}
          className="slam-rc-canvas"
          style={{ width: cssW, height: H }}
          tabIndex={0}
          role="img"
          aria-label={`Occupancy map being built: ${st ? Math.round((100 * st.seen) / st.cells) : 0} % of cells seen. Drag the robot, or focus here and use the arrow keys.`}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          onKeyDown={onKey}
        />
      </div>
      <ColourBar pal={pal} lOcc={lOcc} lFree={lFree} clamp={clamp} />
      <div className="slam-legend small">
        <span>
          <i className="slam-sw is-line" style={{ background: FREE_C }} /> beam (cells crossed: free)
        </span>
        <span>
          <i className="slam-sw" style={{ background: OCC_C, width: 7, height: 7 }} /> return (hit cell: occupied)
        </span>
        <span>
          <i className="slam-sw is-dash" style={{ color: 'var(--text-3)' }} /> max-range reading
        </span>
        <span>
          <i className="slam-sw is-line" style={{ background: 'var(--m4)' }} /> hidden truth
        </span>
        <span>
          <i className="slam-sw" style={{ border: '2px solid var(--bad)', background: 'transparent' }} /> map wrong: ghost, or glass read as free
        </span>
        <span>
          <i className="slam-sw" style={{ background: 'var(--accent)', borderRadius: '50%' }} /> robot (drag it)
        </span>
      </div>
      <div className="slam-bar">
        <Toggle checked={showTruth} onChange={setShowTruth} label="show the true walls" />
        <Toggle checked={showBeams} onChange={setShowBeams} label="show the last scan" />
      </div>
    </div>
  );

  // ---------------------------------------------------------------- right: controls, readouts, predictions
  const right = (
    <div className="slam-right">
      <section className="slam-panel">
        <h4>Scene</h4>
        <Segmented size="sm" label="Scene" value={sceneId} onChange={(id) => load(id, { play: true })} options={(Object.keys(SCENES) as SceneId[]).map((id) => ({ value: id, label: SCENES[id].label, title: SCENES[id].title }))} />
        <Rich className="note" text={scene.note} />
        {scene.person && <Rich className="note" text={`Person: ${personState(info?.t ?? 0)}. Clamping is **${clamp ? 'on' : 'off'}**.`} />}
      </section>

      <section className="slam-panel">
        <h4>Inverse sensor model (per beam)</h4>
        <Slider label="hit" tex="p(m \mid \text{hit})" tip="Probability a cell is occupied given that a beam returned from it. Its log-odds l_occ is added to the hit cell." value={pHit} min={0.52} max={0.99} step={0.01} onChange={setPHit} format={(v) => v.toFixed(2)} />
        <Slider label="pass" tex="p(m \mid \text{pass})" tip="Probability a cell is occupied given that a beam passed through it. Its log-odds l_free (negative) is added to every cell the beam crossed." value={pPass} min={0.05} max={0.48} step={0.01} onChange={setPPass} format={(v) => v.toFixed(2)} />
        <Readouts min={120}>
          <Readout tex="l_\text{occ}" text={sgn(lOcc, 3)} tip="ln[p(m|hit) / (1 − p(m|hit))]: added to the cell where the beam returned" tone="m2" />
          <Readout tex="l_\text{free}" text={sgn(lFree, 3)} tip="ln[p(m|pass) / (1 − p(m|pass))]: added to every cell the beam crossed" tone="m1" />
          <Readout label="hits to p > 0.95" text={`${hitsToCertain}`} tip="Hits needed from l = 0 to pass l = ln(0.95/0.05) = 2.94" />
          <Readout label="passes to undo a hit" text={`${passesToUndo}`} tip="Free readings needed to cancel one hit: l_occ / |l_free|" />
        </Readouts>
        <BeamProfile lOcc={lOcc} lFree={lFree} res={res} maxPolicy={maxPolicy} />
        <Toggle checked={clamp} onChange={setClamp} label={`clamp l to [${lo(CLAMP_P[0]).toFixed(2)}, ${lo(CLAMP_P[1]).toFixed(2)}] (p ${CLAMP_P[0]}–${CLAMP_P[1]})`} />
        <Rich
          className="note"
          text={`Each cell is updated on its own: $l \\leftarrow l + \\ln\\frac{p(m \\mid z)}{1 - p(m \\mid z)} - l_0$ with $l_0 = 0$ (prior 0.5). Clamping stops a cell becoming so certain that it can no longer change when the world does.`}
        />
      </section>

      <section className="slam-panel">
        <h4>Lidar</h4>
        <Slider label="beams" tex="N" tip="Beams per 360° scan. Fewer beams leave gaps between them far from the robot." value={beams} min={8} max={360} step={4} onChange={setBeams} format={(v) => `${Math.round(v)}`} />
        <Slider label="range noise" tex="\sigma_r" tip="Standard deviation of the measured range. It smears walls over neighbouring cells." value={sigma} min={0} max={0.3} step={0.01} unit="m" onChange={setSigma} format={(v) => `${v.toFixed(2)} m`} />
        <Slider label="max range" tex="z_\text{max}" tip="No return within this range gives a max-range reading." value={maxRange} min={2} max={12} step={0.5} onChange={setMaxRange} format={(v) => `${v.toFixed(1)} m`} />
        <div className="slam-bar">
          <span className="small muted">Max-range readings:</span>
          <Segmented
            size="sm"
            label="Max-range readings"
            value={maxPolicy}
            onChange={setMaxPolicy}
            options={[
              { value: 'clear', label: 'clear the beam', title: 'Probabilistic Robotics Table 9.2: free along the beam, no occupied cell' },
              { value: 'ignore', label: 'ignore', title: 'Discard: a missing return may be glass, a black surface or a dropout, not free space' },
            ]}
          />
        </div>
        <Rich className="note" text="Sensor changes rebuild the map from the same poses, as if the drive had been made with this lidar." />
      </section>

      <section className="slam-panel">
        <h4>Grid resolution: memory vs detail</h4>
        <Segmented size="sm" label="Cell size" value={res} onChange={setRes} options={RESOLUTIONS.map((r) => ({ value: r, label: `${r} m` }))} />
        <Readouts min={118}>
          <Readout label="cells" text={`${nx} × ${ny}`} tip="Grid size for this 16 m × 10 m office" />
          <Readout label="memory" text={fmtBytes(bytes)} tip="4 bytes per cell (one float32 log-odds)" tone={flash ? 'accent' : undefined} />
          <Readout label="100 m × 100 m floor" text={fmtBytes(gridBytes(Math.ceil(100 / res), Math.ceil(100 / res)))} tip="The same resolution on a warehouse floor" />
          <Readout label="…in 3D, 10 m tall" text={fmtBytes(Math.ceil(100 / res) ** 2 * Math.ceil(10 / res) * 4)} tip="A voxel grid: memory grows as 1/res³" />
        </Readouts>
        <Rich className="note" text="Halving the cell size quadruples a 2D grid (8× in 3D). Coarse cells blur thin objects into whole cells and can close narrow gaps; fine cells cost memory and need more beams to fill." />
      </section>

      <section className="slam-panel">
        <h4>Map vs the hidden truth</h4>
        <Readouts min={120}>
          <Readout label="cells seen" text={st ? `${((100 * st.seen) / st.cells).toFixed(0)} %` : '—'} tip="Cells touched by at least one beam" />
          <Readout label="ghost obstacles" text={st ? `${st.ghosts}` : '—'} tip="Cells believed occupied (p > 0.65) with no static obstacle in or next to them: where people stood or walked" tone={st && st.ghosts > 20 ? 'bad' : undefined} />
          <Readout label="glass read as free" text={st ? `${st.glassFree}` : '—'} tip="Glass cells believed free (p < 0.35): a planner would drive into them" tone={st && st.glassFree > 0 ? 'bad' : undefined} />
        </Readouts>
        {g && g.res !== res && <Rich className="note" text="Rebuilding at the new resolution…" />}
      </section>

      <section className="slam-panel slam-predicts">
        <h4>Predict, then check</h4>
        <PredictReveal
          id="slam-rc-shadow"
          question="A beam returns from the table 1.5 m away. What does that beam do to the cells 1 m **behind** the table, along the same line?"
          options={['Marks them free: the beam continued in a straight line', 'Marks them occupied: they are behind an obstacle', 'Nothing: they stay unknown (grey)']}
          answer={2}
          explain="The inverse sensor model has three zones: free up to the return, occupied at the return, and **no information** beyond it, because the beam never got there. Parked south of the table, the robot leaves a grey shadow behind it that only a scan from another side can fill. This is why a map needs a tour, not one viewpoint."
          tryIt="park the robot south of the table and take a few scans."
          onApply={() => show(() => load('tour', { park: { x: 2.3, y: 4.9, th: Math.PI / 2 }, scans: 6 }))}
        />
        <PredictReveal
          id="slam-rc-person"
          question="Clamping off. A person stops 2 m in front of the parked robot for 4 s, then walks on. Each hit added $l_\text{occ} = +0.85$; each beam that now passes through adds only $l_\text{free} = -0.41$. When does that spot read free again?"
          options={['At the next scan: the person has gone', 'After several seconds: the hits are cancelled one free beam at a time', 'Never: once a cell is occupied it stays occupied']}
          answer={1}
          explain={`In 4 s the spot collected about 16 hits, $l \\approx 16 \\times 0.85 \\approx +13$. Each free beam removes only $0.41$, so it needs over 30 passes, **about 5 s here**, before $l < 0$. Until then the map holds a ghost obstacle (red outline) that a planner would steer round. With clamping on, $l$ stops at $l_\\text{max} = +${lo(CLAMP_P[1]).toFixed(2)}$, so about 9 free beams (under 2 s) clear it: clamping keeps cells able to change when the world does.`}
          tryIt="watch the red-outlined ghost after the person walks off, then turn clamping on and press Restart."
          onApply={() =>
            show(() => {
              defaultSensor();
              load('person', { play: true, clamp: false });
            })
          }
        />
        <PredictReveal
          id="slam-rc-glass"
          question="The robot drives along a glass partition. In the finished map, the glass looks like…"
          options={['A solid dark wall, like the others', 'Mostly free (light), with at best a broken line', 'Unknown (grey): the lidar cannot see it']}
          answer={1}
          explain="Lidar light goes through glass unless it meets the pane almost head-on, so most beams **pass through** and add $l_\text{free}$ to the glass cells (and map whatever is behind). Only near-perpendicular beams return. The map says you can drive through a solid obstacle: fuse a second sensor (sonar, camera) or mark glass by hand."
          tryIt="drive the glass scene and read 'glass read as free'."
          onApply={() =>
            show(() => {
              defaultSensor();
              load('glass', { play: true });
            })
          }
        />
        <PredictReveal
          id="slam-rc-memory"
          question="Halve the cell size from 0.1 m to 0.05 m. The 2D grid's memory becomes…"
          options={['2× as much', '4× as much', '8× as much']}
          answer={1}
          explain="The number of cells is $(W/\text{res}) \times (H/\text{res})$, so halving res doubles both counts: **4×** (160 × 100 → 320 × 200 cells, 62.5 kB → 250 kB). A 3D voxel grid grows 8×. Detail costs memory quadratically (cubically in 3D), which is why big maps use coarse grids, octrees or submaps."
          tryIt="switch to 0.05 m and read the memory."
          onApply={() =>
            show(() => {
              setRes(0.05);
              setFlash(true);
              window.setTimeout(() => setFlash(false), 2200);
            })
          }
        />
      </section>

      <More label="Conventions and the algorithm (Probabilistic Robotics Tables 9.1–9.2)">
        <Rich
          text={`- This is **mapping**: the pose is known exactly, the map is unknown. Each cell is a binary random variable, updated independently of its neighbours, with the prior 0.5 ($l_0 = 0$).
- For every beam and every cell in its perceptual field: $l_{t} = l_{t-1} + \\text{inverse\\_sensor\\_model}(m_i, x_t, z_t) - l_0$, where the inverse sensor model returns $l_\\text{occ}$ if the cell is at the measured range, $l_\\text{free}$ if it is closer, and $l_0$ (no change) if it lies beyond the return.
- A max-range reading has no return, so it is free all the way (or discarded). The map assumes a **static world**: moving people, doors and parked cars break it.
- Probability for display: $p = 1 - \\frac{1}{1 + e^{l}}$. Grey is $p = 0.5$: never seen, or equal evidence both ways.`}
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

function personState(t: number): string {
  const u = ((t % 16) + 16) % 16;
  if (u < 2.2) return 'walking in';
  if (u < 6.2) return 'stopped to chat (4 s)';
  if (u < 8) return 'walking on';
  if (u < 10) return 'waiting at the far wall';
  if (u < 14) return 'walking back';
  return 'waiting by the door';
}

// ------------------------------------------------------------------ pieces

/** Horizontal colour bar: log-odds −4 … +4 with the probabilities under it, and the steps one hit / one pass add. */
function ColourBar({ pal, lOcc, lFree, clamp }: { pal: { free: RGB; occ: RGB; unknown: RGB }; lOcc: number; lFree: number; clamp: boolean }) {
  const L = 4.5;
  const W = 640;
  const padL = 70;
  const padR = 16;
  const iw = W - padL - padR;
  const sx = (l: number) => padL + ((Math.max(-L, Math.min(L, l)) + L) / (2 * L)) * iw;
  const stops = Array.from({ length: 19 }, (_, i) => -L + (i * 2 * L) / 18);
  const id = 'slam-rc-grad';
  const ticks = [-4, -3, -2, -1, 0, 1, 2, 3, 4];
  const pt = [0.05, 0.25, 0.5, 0.75, 0.95];
  // Rows: arrow labels, the one-hit / one-pass arrows, the bar, log-odds ticks, probabilities.
  const yA = 14;
  const yB = 20;
  return (
    <svg className="slam-svg slam-rc-bar" viewBox={`0 0 ${W} 68`} width="100%" role="img" aria-label={`Colour bar: log-odds from −4.5 (free, light) through 0 (unknown, grey) to +4.5 (occupied, dark). One hit adds ${sgn(lOcc)}, one pass ${sgn(lFree)}.`}>
      <defs>
        <linearGradient id={id} x1="0" x2="1" y1="0" y2="0">
          {stops.map((l, i) => (
            <stop key={i} offset={`${(i / 18) * 100}%`} stopColor={css(mixRgb(pal.free, pal.occ, 1 / (1 + Math.exp(-l))))} />
          ))}
        </linearGradient>
      </defs>
      <text className="slam-wf-axlab" x={4} y={yB + 11}>
        log-odds
      </text>
      <rect x={padL} y={yB} width={iw} height={16} fill={`url(#${id})`} stroke="var(--border)" rx={3} />
      {clamp && (
        <>
          <line x1={sx(lo(CLAMP_P[0]))} x2={sx(lo(CLAMP_P[0]))} y1={yB - 4} y2={yB + 20} className="slam-rc-clamp" />
          <line x1={sx(lo(CLAMP_P[1]))} x2={sx(lo(CLAMP_P[1]))} y1={yB - 4} y2={yB + 20} className="slam-rc-clamp" />
        </>
      )}
      {ticks.map((v) => (
        <text key={v} className="slam-wf-tick" x={sx(v)} y={yB + 30} textAnchor="middle">
          {v === 0 ? '0' : v > 0 ? `+${v}` : `−${-v}`}
        </text>
      ))}
      {pt.map((p) => (
        <text key={p} className="slam-wf-ptick" x={sx(Math.log(p / (1 - p)))} y={yB + 43} textAnchor="middle">
          {p}
        </text>
      ))}
      <text className="slam-wf-axlab is-p" x={4} y={yB + 43}>
        p(m)
      </text>
      {/* one hit and one pass, from 0 */}
      <text className="slam-rc-t is-strong" x={sx(0) + 3} y={yA - 6} style={{ fill: 'var(--m2)' }}>
        {`one hit ${sgn(lOcc)} →`}
      </text>
      <text className="slam-rc-t is-strong" x={sx(0) - 3} y={yA - 6} textAnchor="end" style={{ fill: 'var(--m1)' }}>
        {`← one pass ${sgn(lFree)}`}
      </text>
      <path d={`M${sx(0)} ${yA} L${sx(lOcc)} ${yA}`} stroke="var(--m2)" strokeWidth={3} />
      <path d={`M${sx(lOcc)} ${yA - 3.5} L${sx(lOcc) + 5} ${yA} L${sx(lOcc)} ${yA + 3.5}Z`} fill="var(--m2)" />
      <path d={`M${sx(0)} ${yA} L${sx(lFree)} ${yA}`} stroke="var(--m1)" strokeWidth={3} />
      <path d={`M${sx(lFree)} ${yA - 3.5} L${sx(lFree) - 5} ${yA} L${sx(lFree)} ${yA + 3.5}Z`} fill="var(--m1)" />
    </svg>
  );
}

/** The inverse sensor model along one beam: l_free up to the return, l_occ at it, nothing beyond. */
function BeamProfile({ lOcc, lFree, res, maxPolicy }: { lOcc: number; lFree: number; res: number; maxPolicy: 'clear' | 'ignore' }) {
  const W = 360;
  const Hh = 132;
  const x0 = 34;
  const x1 = W - 10;
  const z = 0.62;
  const sx = (f: number) => x0 + f * (x1 - x0);
  const base = 66;
  const k = 15;
  const yOf = (l: number) => base - Math.max(-3.4, Math.min(3.4, l)) * k;
  const cellW = Math.max(6, (res / 8) * (x1 - x0));
  const zx = sx(z);
  return (
    <svg className="slam-svg slam-rc-ism" viewBox={`0 0 ${W} ${Hh}`} width="100%" role="img" aria-label={`Inverse sensor model along one beam: ${lFree.toFixed(2)} for every cell before the return, +${lOcc.toFixed(2)} at the return, nothing beyond`}>
      <defs>
        <pattern id="slam-rc-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="6" stroke="var(--text-3)" strokeWidth="1" opacity="0.5" />
        </pattern>
      </defs>
      <rect x={x0} y={yOf(0)} width={zx - cellW / 2 - x0} height={Math.max(1, yOf(lFree) - yOf(0))} fill="var(--m1)" opacity={0.75} />
      <rect x={zx - cellW / 2} y={yOf(lOcc)} width={cellW} height={Math.max(1, yOf(0) - yOf(lOcc))} fill="var(--m2)" />
      <rect x={zx + cellW / 2 + 1} y={20} width={x1 - zx - cellW / 2 - 1} height={92} fill="url(#slam-rc-hatch)" />
      <line x1={x0} x2={x1} y1={base} y2={base} stroke="var(--text-2)" strokeWidth={1.2} />
      <line x1={zx} x2={zx} y1={14} y2={118} stroke="var(--text-3)" strokeDasharray="3 3" />
      <text className="slam-rc-t" x={zx} y={12} textAnchor="middle">
        measured range z
      </text>
      <text className="slam-rc-t is-strong" x={x0 + 4} y={yOf(lFree) + 13} style={{ fill: 'var(--m1)' }}>
        {`free: ${sgn(lFree)} per cell crossed`}
      </text>
      <text className="slam-rc-t is-strong" x={zx - cellW / 2 - 4} y={yOf(lOcc) + 4} textAnchor="end" style={{ fill: 'var(--m2)' }}>
        {`occupied: ${sgn(lOcc)}`}
      </text>
      <text className="slam-rc-t" x={(zx + x1) / 2 + 4} y={50} textAnchor="middle">
        no information
      </text>
      <text className="slam-rc-t" x={(zx + x1) / 2 + 4} y={63} textAnchor="middle">
        (occluded: 0)
      </text>
      <text className="slam-rc-t" x={x0} y={128}>
        robot
      </text>
      <text className="slam-rc-t" x={x1} y={128} textAnchor="end">
        {`distance along the beam →   no return: ${maxPolicy === 'clear' ? 'all free' : 'ignored'}`}
      </text>
      <text className="slam-rc-t" x={6} y={yOf(0) + 4}>
        Δl
      </text>
    </svg>
  );
}
