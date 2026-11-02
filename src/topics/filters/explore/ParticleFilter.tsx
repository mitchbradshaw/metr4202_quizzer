// pf: a 2-D particle filter (Monte Carlo localisation) in a room with four look-alike pillars and one unique beacon.
// Step SAMPLE (every particle moves with its own noisy copy of the command), WEIGHT (w = p(z | particle); dot size
// shows the weight) and RESAMPLE (low-variance; dropped particles fade out, rings mark stacked duplicates), or let
// it run. Global localisation in the symmetric room gives two clusters until the beacon breaks the tie; kidnapping,
// random-particle injection and particle deprivation are one click away. Drawn on a canvas (2000 particles at
// 60 fps); the filter itself is pfWorld.ts on top of core/filters_particle.ts.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ExploreItem } from '../../../engine/types';
import { useRaf, useWidth } from '../../../anim/hooks';
import { Line, Plot } from '../../../plot/Plot';
import { Button, More, Readout, Readouts, Segmented, Slider, Toggle } from '../../../ui/kit';
import { PredictReveal } from '../../../ui/PredictReveal';
import { Rich } from '../../../ui/Rich';
import { useThemeColors } from '../../../ui/theme';
import { FiltersLayout, Panel, f2, revealVisual } from './common';
import { BEACON, MOTION_MODEL, PF_DEFAULT, PILLARS, PfSim, ROOM_H, ROOM_W, ROUTE, SENSOR, STEP, type PfConfig, type Phase } from './pfWorld';

export const meta: Omit<ExploreItem, 'component'> = {
  id: 'pf',
  title: 'Particle filter: sample, weight, resample',
  summary:
    'Monte Carlo localisation in a room with four look-alike pillars and one unique beacon. Step the three phases (SAMPLE through the noisy motion model, WEIGHT by $p(z \\mid x)$, RESAMPLE with the low-variance sampler) or let it run; kidnap the robot, inject random particles, and starve the filter of particles.',
  notice:
    'The particles **are** the belief: in a symmetric room they split into two clusters that both explain every reading, and only a distinctive landmark kills the wrong one. A Gaussian could never hold both.',
  minutes: 14,
};

/** Seeds chosen so each demonstration shows its effect (checked in the self-tests). */
export const PF_SEEDS = { twins: 4, kidnap: 1, few: 2, noNoise: 1 };

const MARGIN_M = 0.3;
const VIEW_W = ROOM_W + 2 * MARGIN_M;
const VIEW_H = ROOM_H + 2 * MARGIN_M;

const PHASE_LABEL: Record<Phase, string> = { sample: '① Sample (move)', weight: '② Weight (sense)', resample: '③ Resample' };
const COLORS = ['--m1', '--m2', '--m3', '--m4', '--text', '--text-2', '--text-3', '--surface', '--surface-2', '--border', '--accent', '--bad'] as const;

interface Anim {
  phase: Phase | null;
  start: number;
  dur: number;
}

export default function ParticleFilter() {
  const simRef = useRef<PfSim | null>(null);
  if (!simRef.current) simRef.current = new PfSim(PF_DEFAULT, PF_SEEDS.twins);
  const sim = simRef.current;
  const [cfg, setCfgState] = useState<PfConfig>(PF_DEFAULT);
  const [ver, setVer] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(4);
  const [animating, setAnimating] = useState(false);
  const [wrapRef, width] = useWidth<HTMLDivElement>(680);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const leftRef = useRef<HTMLDivElement>(null);
  const colors = useThemeColors(COLORS);
  const anim = useRef<Anim>({ phase: null, start: 0, dur: 0 });
  const stopAt = useRef<number | null>(null);
  const lastStepAt = useRef(0);
  const kidnappedAt = useRef<number | null>(null);

  const bump = () => setVer((v) => v + 1);

  // ---------------------------------------------------------------- drawing
  const draw = useCallback(
    (p: number) => {
      const cv = canvasRef.current;
      if (!cv) return;
      const ctx = cv.getContext('2d');
      if (!ctx) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const cssW = Math.max(200, width);
      const cssH = (cssW * VIEW_H) / VIEW_W;
      if (cv.width !== Math.round(cssW * dpr) || cv.height !== Math.round(cssH * dpr)) {
        cv.width = Math.round(cssW * dpr);
        cv.height = Math.round(cssH * dpr);
        cv.style.height = `${cssH}px`;
      }
      const k = (cssW / VIEW_W) * dpr;
      const X = (x: number) => (x + MARGIN_M) * k;
      const Y = (y: number) => (ROOM_H + MARGIN_M - y) * k;
      const c = colors;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = c['--surface-2'];
      ctx.fillRect(0, 0, cv.width, cv.height);
      ctx.fillStyle = c['--surface'];
      ctx.fillRect(X(0), Y(ROOM_H), ROOM_W * k, ROOM_H * k);
      // route
      ctx.setLineDash([6 * dpr, 6 * dpr]);
      ctx.strokeStyle = c['--text-3'];
      ctx.globalAlpha = 0.45;
      ctx.lineWidth = 1.5 * dpr;
      ctx.beginPath();
      ROUTE.forEach((w, i) => (i ? ctx.lineTo(X(w.x), Y(w.y)) : ctx.moveTo(X(w.x), Y(w.y))));
      ctx.closePath();
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
      // walls
      ctx.strokeStyle = c['--text-2'];
      ctx.lineWidth = 3 * dpr;
      ctx.strokeRect(X(0), Y(ROOM_H), ROOM_W * k, ROOM_H * k);

      const s = sim.set;
      const n = s.n;
      const robot = sim.robot;
      // sensor range
      ctx.strokeStyle = c['--m2'];
      ctx.globalAlpha = 0.25;
      ctx.lineWidth = 1 * dpr;
      ctx.beginPath();
      ctx.arc(X(robot.x), Y(robot.y), SENSOR.range * k, 0, 2 * Math.PI);
      ctx.stroke();
      ctx.globalAlpha = 1;

      // landmarks
      PILLARS.forEach((l, i) => {
        ctx.fillStyle = c['--text-2'];
        ctx.beginPath();
        ctx.arc(X(l.x), Y(l.y), 0.17 * k, 0, 2 * Math.PI);
        ctx.fill();
        if (sim.cfg.distinguishable) {
          ctx.fillStyle = c['--surface'];
          ctx.font = `700 ${11 * dpr}px system-ui, sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(String(i + 1), X(l.x), Y(l.y) + 0.5 * dpr);
        }
      });
      if (sim.cfg.beacon) {
        const bx = X(BEACON.x);
        const by = Y(BEACON.y);
        const r = 0.22 * k;
        ctx.fillStyle = c['--m4'];
        ctx.beginPath();
        ctx.moveTo(bx, by - r);
        ctx.lineTo(bx + r, by);
        ctx.lineTo(bx, by + r);
        ctx.lineTo(bx - r, by);
        ctx.closePath();
        ctx.fill();
      }

      // observations (after WEIGHT, until the next SAMPLE)
      const showObs = sim.next === 'resample' || (sim.next === 'sample' && sim.obs.length > 0);
      if (showObs) {
        ctx.strokeStyle = c['--m2'];
        ctx.lineWidth = 2 * dpr;
        ctx.globalAlpha = anim.current.phase === 'weight' ? Math.min(1, p * 2) : 0.85;
        for (const o of sim.obs) {
          const a = robot.th + o.b;
          const ex = robot.x + o.r * Math.cos(a);
          const ey = robot.y + o.r * Math.sin(a);
          ctx.beginPath();
          ctx.moveTo(X(robot.x), Y(robot.y));
          ctx.lineTo(X(ex), Y(ey));
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(X(ex), Y(ey), 3.5 * dpr, 0, 2 * Math.PI);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }

      // particles
      const ph = anim.current.phase;
      const glide = ph === 'sample' && p < 1;
      let wMax = 0;
      for (let i = 0; i < n; i++) if (s.w[i] > wMax) wMax = s.w[i];
      const weighted = sim.next === 'resample' && wMax > 0;
      const grow = ph === 'weight' ? p : 1;
      const base = 1.5 * dpr;
      const BUCKETS = 6;
      const paths: Path2D[] = Array.from({ length: BUCKETS }, () => new Path2D());
      const ticks = new Path2D();
      const tick = 0.16 * k;
      for (let i = 0; i < n; i++) {
        const x = glide ? sim.prevX[i] + (s.x[i] - sim.prevX[i]) * p : s.x[i];
        const y = glide ? sim.prevY[i] + (s.y[i] - sim.prevY[i]) * p : s.y[i];
        const th = glide ? sim.prevTh[i] + (s.th[i] - sim.prevTh[i]) * p : s.th[i];
        let r = base;
        let b = BUCKETS - 1;
        if (weighted) {
          // Area grows with the weight (radius with its square root); the WEIGHT animation grows into it.
          const rel = Math.sqrt(s.w[i] / wMax);
          r = Math.max(0.9 * dpr, base * (1 - grow) + (0.7 + 5.8 * rel) * dpr * grow);
          b = Math.min(BUCKETS - 1, Math.floor(rel * BUCKETS));
        }
        const px = X(x);
        const py = Y(y);
        paths[b].moveTo(px + r, py);
        paths[b].arc(px, py, r, 0, 2 * Math.PI);
        if (!weighted || s.w[i] / wMax > 0.05) {
          ticks.moveTo(px, py);
          ticks.lineTo(px + tick * Math.cos(th), py - tick * Math.sin(th));
        }
      }
      ctx.fillStyle = c['--m1'];
      for (let b = 0; b < BUCKETS; b++) {
        ctx.globalAlpha = weighted ? 0.25 + (0.7 * (b + 1)) / BUCKETS : 0.55;
        ctx.fill(paths[b]);
      }
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = c['--m1'];
      ctx.lineWidth = 1 * dpr;
      ctx.stroke(ticks);
      ctx.globalAlpha = 1;

      // resample: dropped particles fade out, stacked duplicates get rings
      if (sim.next === 'sample' && sim.t > 0 && sim.copies[0] > 0) {
        if (ph === 'resample' && p < 1 && sim.deadX.length) {
          ctx.fillStyle = c['--bad'];
          ctx.globalAlpha = 0.6 * (1 - p);
          const dead = new Path2D();
          for (let i = 0; i < sim.deadX.length; i++) {
            const px = X(sim.deadX[i]);
            const py = Y(sim.deadY[i]);
            dead.moveTo(px + 2 * dpr, py);
            dead.arc(px, py, 2 * dpr, 0, 2 * Math.PI);
          }
          ctx.fill(dead);
          ctx.globalAlpha = 1;
        }
        const rings = new Path2D();
        let drawn = 0;
        for (let i = 0; i < n && drawn < 400; ) {
          const kk = sim.copies[i];
          if (kk >= 3) {
            const px = X(s.x[i]);
            const py = Y(s.y[i]);
            const rr = (2 + 1.6 * Math.sqrt(kk)) * dpr;
            rings.moveTo(px + rr, py);
            rings.arc(px, py, rr, 0, 2 * Math.PI);
            drawn++;
          }
          i += Math.max(1, kk);
        }
        ctx.strokeStyle = c['--m1'];
        ctx.lineWidth = 1.2 * dpr;
        ctx.globalAlpha = 0.8;
        ctx.stroke(rings);
        ctx.globalAlpha = 1;
      }

      // weighted mean (misleading when the belief has two peaks)
      if (n > 0 && sim.t > 0) {
        let W = 0;
        let sx = 0;
        let sy = 0;
        for (let i = 0; i < n; i++) {
          W += s.w[i];
          sx += s.w[i] * s.x[i];
          sy += s.w[i] * s.y[i];
        }
        const mx = X(W > 0 ? sx / W : ROOM_W / 2);
        const my = Y(W > 0 ? sy / W : ROOM_H / 2);
        const a = 6 * dpr;
        ctx.strokeStyle = c['--accent'];
        ctx.lineWidth = 2.5 * dpr;
        ctx.beginPath();
        ctx.moveTo(mx - a, my - a);
        ctx.lineTo(mx + a, my + a);
        ctx.moveTo(mx + a, my - a);
        ctx.lineTo(mx - a, my + a);
        ctx.stroke();
      }

      // the true robot
      const rx = X(robot.x);
      const ry = Y(robot.y);
      const L = 0.32 * k;
      ctx.save();
      ctx.translate(rx, ry);
      ctx.rotate(-robot.th);
      ctx.beginPath();
      ctx.moveTo(L, 0);
      ctx.lineTo(-0.6 * L, 0.55 * L);
      ctx.lineTo(-0.35 * L, 0);
      ctx.lineTo(-0.6 * L, -0.55 * L);
      ctx.closePath();
      ctx.fillStyle = c['--text'];
      ctx.strokeStyle = c['--surface'];
      ctx.lineWidth = 2 * dpr;
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    },
    [colors, width, sim]
  );

  // ---------------------------------------------------------------- running phases
  const durFor = (ph: Phase, auto: boolean) => {
    if (auto && speed >= 10) return 0;
    const cycleMs = auto ? 1000 / speed : 1150;
    return (ph === 'sample' ? 0.42 : ph === 'weight' ? 0.33 : 0.25) * cycleMs * 0.85;
  };

  const runPhase = (auto = false) => {
    const ph = sim.step();
    anim.current = { phase: ph, start: performance.now(), dur: durFor(ph, auto) };
    lastStepAt.current = performance.now();
    setAnimating(true);
    bump();
  };

  const runCycle = () => {
    while (sim.next !== 'sample') sim.step();
    sim.sample();
    sim.weight();
    sim.resample();
    anim.current = { phase: null, start: 0, dur: 0 };
    bump();
  };

  useRaf(
    (_dt, _t) => {
      const now = performance.now();
      const a = anim.current;
      const p = a.dur > 0 ? Math.min(1, (now - a.start) / a.dur) : 1;
      draw(p);
      if (p >= 1 && !playing) {
        setAnimating(false);
        return;
      }
      if (playing && p >= 1) {
        const gap = speed >= 10 ? 0 : (1000 / speed) * 0.05;
        if (now - lastStepAt.current - a.dur >= gap) {
          if (sim.next === 'sample' && stopAt.current !== null && sim.t >= stopAt.current) {
            stopAt.current = null;
            setPlaying(false);
            setAnimating(false);
            return;
          }
          runPhase(true);
        }
      }
    },
    playing || animating
  );

  // Static redraw when nothing animates (resize, theme, settings).
  useEffect(() => {
    if (!playing && !animating) draw(1);
  }, [draw, ver, playing, animating, cfg]);

  const st = useMemo(() => sim.stats(), [sim, ver]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------------------------------------------------------------- settings
  const setCfg = (patch: Partial<PfConfig>, reset = false) => {
    const next = { ...cfg, ...patch };
    setCfgState(next);
    if (reset) {
      sim.reset(sim.seed, next);
      kidnappedAt.current = null;
      anim.current = { phase: null, start: 0, dur: 0 };
    } else Object.assign(sim.cfg, patch);
    bump();
  };

  const restart = (seed: number, patch: Partial<PfConfig>, warm = 0, kidnap = false) => {
    const next = { ...PF_DEFAULT, ...patch };
    setCfgState(next);
    sim.reset(seed, next);
    kidnappedAt.current = null;
    if (warm) sim.cycles(warm);
    if (kidnap) {
      sim.kidnap();
      kidnappedAt.current = sim.t;
    }
    anim.current = { phase: null, start: 0, dur: 0 };
    bump();
  };

  const playTo = (t: number, sp: number) => {
    stopAt.current = t;
    setSpeed(sp);
    lastStepAt.current = 0;
    setPlaying(true);
    revealVisual(leftRef.current);
  };

  const kidnapNow = () => {
    sim.kidnap();
    kidnappedAt.current = sim.t;
    bump();
  };

  const fitPts = useMemo(() => sim.fit.map((f, i) => [i + 1, Number.isFinite(f) ? f : NaN] as const), [sim, ver]); // eslint-disable-line react-hooks/exhaustive-deps
  const lastFit = sim.fit.length ? sim.fit[sim.fit.length - 1] : NaN;
  const hyp = st.clusters.length;

  // ---------------------------------------------------------------- the step narrative
  const narrative = (() => {
    if (sim.t === 0) return `**Start**: ${sim.set.n} particles spread ${cfg.init === 'global' ? 'uniformly over the room with random headings (global localisation: the robot could be anywhere)' : 'tightly around the true pose (tracking)'}. Each one is a guess of the pose $(x, y, \\theta)$; together they are the belief. Press **① Sample**.`;
    if (sim.next === 'weight')
      return `**① Sample** (prediction): the robot turned ${f2(sim.lastU.turn)} rad and drove ${STEP} m. Every particle executed the same command plus its **own** random noise ($\\sigma$ = ${f2(MOTION_MODEL.sDist * cfg.noiseScale)} m, ${f2(MOTION_MODEL.sTurn * cfg.noiseScale)} rad), $x^{[m]} \\sim p(x_t \\mid u_t, x^{[m]}_{t-1})$: the cloud moves and spreads. Weights are unchanged.`;
    if (sim.next === 'resample')
      return `**② Weight** (correction): the robot saw ${sim.obs.length ? `${sim.obs.length} landmark${sim.obs.length > 1 ? 's' : ''} (${sim.obs.map((o) => `${o.kind === 'beacon' ? 'beacon' : cfg.distinguishable ? `pillar ${o.id + 1}` : 'a pillar'} at ${f2(o.r)} m, ${Math.round((o.b * 180) / Math.PI)}°`).join('; ')})` : 'nothing in range, so every particle in the room keeps the same weight'}. Each particle is weighted by $w^{[m]} = p(z_t \\mid x^{[m]})$: how well the readings fit **from where it stands**. Dot size shows the weight. $N_{eff} = 1/\\sum w^2$ = ${Math.round(st.neff)} of ${sim.set.n}.`;
    return `**③ Resample**: ${sim.set.n} draws in proportion to the weights (${cfg.method === 'low-variance' ? 'low-variance sampler: one random number, equally spaced pointers' : 'multinomial: independent draws'}). Heavy particles are copied (rings), light ones die (red); ${st.distinct} distinct positions remain${cfg.inject > 0 ? `, including ${Math.round(cfg.inject * sim.set.n)} fresh random particles` : ''}. The weights are reset to $1/M$; motion noise in the next sample separates the copies.`;
  })();

  // ---------------------------------------------------------------- render
  const left = (
    <div className="filters-panel filters-stack">
      <div className="filters-phase-btns">
        {(['sample', 'weight', 'resample'] as Phase[]).map((ph) => (
          <Button key={ph} size="sm" className={sim.next === ph && !playing ? 'is-next' : ''} variant={sim.next === ph ? 'primary' : 'default'} disabled={playing || sim.next !== ph} onClick={() => runPhase(false)}>
            {PHASE_LABEL[ph]}
          </Button>
        ))}
        <Button size="sm" disabled={playing} onClick={runCycle} title="Sample, weight and resample in one go">
          Full cycle
        </Button>
        <Button
          size="sm"
          variant={playing ? 'primary' : 'default'}
          onClick={() => {
            stopAt.current = null;
            lastStepAt.current = 0;
            setPlaying((v) => !v);
          }}
        >
          {playing ? '⏸ Pause' : '▶ Run'}
        </Button>
        <Segmented size="sm" label="Cycles per second" value={speed} onChange={setSpeed} options={[1, 2, 4, 10].map((v) => ({ value: v, label: `${v}/s` }))} />
      </div>
      <div ref={wrapRef} className="filters-canvas-wrap">
        <canvas ref={canvasRef} style={{ height: (Math.max(200, width) * VIEW_H) / VIEW_W }} role="img" aria-label={`Room with ${sim.set.n} particles after cycle ${sim.t}. ${hyp} hypothesis cluster${hyp === 1 ? '' : 's'}; weighted-mean error ${f2(st.err)} m.`} />
      </div>
      <div className="filters-row is-between">
        <span className="filters-phase-chip">
          cycle {sim.t} · next: {sim.next}
        </span>
        <div className="filters-row">
          <Button size="sm" onClick={() => setCfg({}, true)} title="New start with the current settings">
            ⟲ Restart
          </Button>
          <Button size="sm" onClick={kidnapNow} title="Carry the robot elsewhere without telling the filter">
            Kidnap the robot
          </Button>
        </div>
      </div>
      <div className="filters-caption">
        <span className="filters-key" style={{ background: 'var(--text)' }} />
        true robot ·
        <span className="filters-key" style={{ background: 'var(--m1)', marginLeft: 6 }} />
        particles (size = weight) ·
        <span className="filters-key" style={{ background: 'var(--accent)', marginLeft: 6 }} />× weighted mean ·
        <span className="filters-key" style={{ background: 'var(--text-2)', marginLeft: 6 }} />
        pillars ·
        <span className="filters-key" style={{ background: 'var(--m4)', marginLeft: 6 }} />
        beacon ·
        <span className="filters-key" style={{ background: 'var(--m2)', marginLeft: 6 }} />
        readings
      </div>
      <Rich className="filters-note" text={narrative} />
    </div>
  );

  const right = (
    <>
      <Panel title="The filter">
        <div className="filters-sliders">
          <Slider label="particles" tex="M" tip="Number of particles. A change takes effect at the next resample." value={cfg.M} min={20} max={2000} log sig={4} format={(v) => String(Math.round(v))} onChange={(v) => setCfg({ M: Math.round(v) })} />
          <Slider label="particle motion noise" tex="\times" tip="Scale on the noise each particle adds in SAMPLE (relative to the filter's motion model). 0: copies never separate." value={cfg.noiseScale} min={0} max={2} step={0.05} onChange={(v) => setCfg({ noiseScale: v })} format={(v) => `${v.toFixed(2)}×`} />
        </div>
        <div className="filters-stack">
          <div className="filters-row">
            <span className="filters-label">Pillars</span>
            <Segmented
              size="sm"
              label="Pillars"
              value={cfg.distinguishable ? 'id' : 'same'}
              onChange={(v) => setCfg({ distinguishable: v === 'id' })}
              options={[
                { value: 'same', label: 'look alike', title: 'The robot sees “a pillar” but not which one (unknown data association)' },
                { value: 'id', label: 'numbered', title: 'Each pillar carries an ID (known data association)' },
              ]}
            />
            <Toggle checked={cfg.beacon} onChange={(v) => setCfg({ beacon: v })} label="unique beacon" />
          </div>
          <div className="filters-row">
            <span className="filters-label">Start</span>
            <Segmented
              size="sm"
              label="Initial particles"
              value={cfg.init}
              onChange={(v) => setCfg({ init: v }, true)}
              options={[
                { value: 'global', label: 'anywhere (global)' },
                { value: 'local', label: 'known pose (tracking)' },
              ]}
            />
          </div>
          <div className="filters-row">
            <span className="filters-label">Random particles per resample</span>
            <Segmented
              size="sm"
              label="Random particles injected at each resample"
              value={cfg.inject}
              onChange={(v) => setCfg({ inject: v })}
              options={[
                { value: 0, label: 'none' },
                { value: 0.01, label: '1 %' },
                { value: 0.05, label: '5 %' },
              ]}
            />
          </div>
          <div className="filters-row">
            <span className="filters-label">Resampler</span>
            <Segmented
              size="sm"
              label="Resampling method"
              value={cfg.method}
              onChange={(v) => setCfg({ method: v })}
              options={[
                { value: 'low-variance', label: 'low-variance', title: 'One random number r in [0, 1/M); pointers r + (m − 1)/M' },
                { value: 'multinomial', label: 'multinomial', title: 'M independent draws' },
              ]}
            />
          </div>
        </div>
      </Panel>

      <Panel title={`After cycle ${sim.t}`} live>
        <Readouts min={104}>
          <Readout label="hypotheses" text={hyp ? `${hyp}` : '—'} tip="Clusters of particles holding at least 2 % of the weight each" tone="m1" />
          <Readout label="their weight" text={hyp ? st.clusters.slice(0, 3).map((m) => m.toFixed(2)).join(' / ') : '—'} tip="Weight held by each cluster, largest first" />
          <Readout tex="N_{eff}" value={st.neff} sig={3} tip="Effective sample size 1/Σw²: equal to M after a resample, small when a few particles hold most of the weight" />
          <Readout label="distinct" value={st.distinct} sig={4} tip="Particles at distinct positions (copies stack after a resample)" />
          <Readout label="mean error" value={st.err} unit="m" sig={3} tip="Distance from the weighted mean to the true robot (meaningless when there are two clusters)" />
          <Readout label="mass near truth" value={st.nearTruth} sig={2} tip="Weight within 0.75 m of the true robot" tone={st.nearTruth > 0.5 ? 'ok' : st.nearTruth < 0.05 && sim.t > 3 ? 'bad' : undefined} />
        </Readouts>
        <div className="filters-label" style={{ marginTop: 8 }}>
          how well the particles explain the readings (mean p(z | x), 1 = perfect)
        </div>
        <Plot x={{ min: 1, max: Math.max(20, sim.fit.length) }} y={{ min: 0, max: 1 }} height={110} margin={{ l: 36, r: 8, b: 22 }} ariaLabel="Average likelihood of the particles per cycle">
          <Line points={fitPts} color="var(--m2)" width={2} />
        </Plot>
        <Rich
          className="filters-note"
          text={
            kidnappedAt.current !== null
              ? `Kidnapped after cycle ${kidnappedAt.current}. ${Number.isFinite(lastFit) && lastFit < 0.05 ? 'The readings now fit almost no particle: the average likelihood has collapsed, the classic sign that the filter is lost.' : 'Watch the average likelihood: a sudden drop means the readings no longer fit the particles.'}`
              : 'A low value means the readings fit few particles: early in global localisation, or after a kidnap.'
          }
        />
      </Panel>

      <Panel title="Predict, then check" className="filters-predicts">
        <PredictReveal
          id="filters-pf-twins"
          question="Look-alike pillars, **no** beacon, particles spread over the whole room. After 15 cycles, how many clusters (hypotheses) will the particles form?"
          options={['One, at the robot', 'Two', 'Four, one per pillar', 'None: they stay spread out']}
          answer={1}
          explain="The pillars are laid out with 180° rotational symmetry, so a robot at $(x, y, \theta)$ and one at $(10 - x, 6 - y, \theta + \pi)$ get identical readings at every step. Both clusters explain the data equally well, so the filter keeps **both**: a bimodal belief that one Gaussian (KF or EKF) cannot represent. The weighted mean (×) sits between them, where the robot certainly is not. (Which cluster holds more weight is down to chance; nothing in the readings can tell them apart.)"
          tryIt="switch the beacon off, press Restart, then Run for about 15 cycles."
          onApply={() => {
            restart(PF_SEEDS.twins, { beacon: false });
            playTo(15, 4);
          }}
        />
        <PredictReveal
          id="filters-pf-beacon"
          question="Same room, but now the **unique beacon** is switched on. What happens when the robot first sees it?"
          options={['Nothing: one reading cannot beat 15 cycles of evidence', 'The cluster on the wrong side dies out within a cycle or two', 'Both clusters move towards the beacon', 'The particles spread out uniformly again']}
          answer={1}
          explain="Particles in the wrong cluster expect the beacon somewhere else (or not at all), so $p(z \mid x)$ is tiny for them and resampling drops them in one or two cycles. One distinctive reading is worth more than many ambiguous ones: it breaks the symmetry. This is why real maps need distinctive features (or a known starting pose)."
          tryIt="keep the beacon on and run until the robot passes the purple diamond (about cycle 20)."
          onApply={() => {
            restart(PF_SEEDS.twins, { beacon: true });
            playTo(26, 4);
          }}
        />
        <PredictReveal
          id="filters-pf-kidnap"
          question="The filter has locked onto the robot (numbered pillars, no random particles). Now **kidnap** the robot to another part of the room. What happens?"
          options={['The particles jump to the new pose at the next reading', 'The filter stays wrong: no particle is near the new pose, so it cannot recover', 'The particles spread out until they find it', 'The filter recovers after a few cycles on its own']}
          answer={1}
          explain="Resampling can only copy particles that already exist. After a kidnap every particle is in the wrong place; all of them explain the readings badly, normalisation hides how badly, and the cloud keeps tracking a robot that is not there. The tell-tale is the collapse of the average likelihood (the orange chart)."
          tryIt="choose “known pose”, run 10 cycles, press Kidnap the robot, then Run."
          onApply={() => {
            restart(PF_SEEDS.kidnap, { distinguishable: true, init: 'local', inject: 0 }, 10, true);
            playTo(25, 4);
          }}
        />
        <PredictReveal
          id="filters-pf-inject"
          question="Same kidnap, but now **5 %** of the particles are replaced by random ones at every resample. What happens?"
          options={['Nothing changes: 5 % is too few to matter', 'The filter recovers: a random particle lands near the robot, gets a high weight and the cloud regrows there', 'The estimate becomes useless because of the random particles', 'The filter recovers instantly, at the next reading']}
          answer={1}
          explain="With ~100 random particles per cycle, some land near the true pose. Their weights dwarf those of the lost cluster, so resampling multiplies them and within a few cycles the cloud has moved. The price: 5 % of the particles are always wasted on guesses. Adaptive versions (augmented MCL) inject only when the average likelihood drops."
          tryIt="set Random particles to 5 %, then kidnap and run."
          onApply={() => {
            restart(PF_SEEDS.kidnap, { distinguishable: true, init: 'local', inject: 0.05 }, 10, true);
            playTo(25, 4);
          }}
        />
        <PredictReveal
          id="filters-pf-few"
          question="Global localisation (look-alike pillars, beacon on) with only **50** particles. What is the most likely outcome after 40 cycles?"
          options={['The same as with 2000, just noisier', 'It locks onto the wrong place and stays there', 'It never forms any cluster', 'It finds the robot faster, with less to compute']}
          answer={1}
          explain="50 particles spread over 60 m² and every heading leave the true pose with no particle nearby, so the cloud settles on whichever wrong pose happens to fit best and becomes confident in it: **particle deprivation**. Resampling cannot create particles where there were none. The cost of a particle filter grows with the size of the state space; random injection or more particles are the cures."
          tryIt="set M to 50, press Restart, then Run."
          onApply={() => {
            restart(PF_SEEDS.few, { M: 50 });
            playTo(40, 10);
          }}
        />
        <PredictReveal
          id="filters-pf-nonoise"
          question="Tracking a known start pose, set the particles’ motion noise to **zero**. What happens over 40 cycles?"
          options={['It tracks better: no noise, no error', 'Nothing changes', 'Resampling leaves fewer and fewer distinct particles, until one is left and the robot is lost', 'The particles spread out uniformly']}
          answer={2}
          explain="Each resample copies the heavy particles; only the motion noise of the next SAMPLE separates the copies again. With no noise the copies stay stacked, the number of distinct particles collapses (watch “distinct”), and a single point cannot follow a robot whose real motion is noisy. The motion noise in a particle filter is not a nuisance: it keeps the hypotheses diverse."
          tryIt="choose “known pose”, drag the motion noise to 0 and run."
          onApply={() => {
            restart(PF_SEEDS.noNoise, { distinguishable: true, init: 'local', noiseScale: 0 });
            playTo(40, 10);
          }}
        />
      </Panel>

      <More label="The algorithm (Thrun’s MCL and the low-variance sampler)">
        <Rich
          text={`For each particle $m = 1 \\ldots M$: **sample** $x_t^{[m]} \\sim p(x_t \\mid u_t, x_{t-1}^{[m]})$, then **weight** $w_t^{[m]} = p(z_t \\mid x_t^{[m]})$. Then **resample**: draw $M$ particles with probability $\\propto w_t^{[m]}$.

The low-variance sampler draws **one** number $r \\in [0, 1/M)$ and walks $M$ equally spaced pointers $U = r + (m - 1)/M$ along the running sum of the normalised weights: the particle whose interval contains a pointer is copied. A particle with weight $w$ gets $\\lfloor Mw \\rfloor$ or $\\lceil Mw \\rceil$ copies (exactly $Mw$ on average), so it adds far less randomness than $M$ independent draws, and a particle with weight $1/M$ is copied exactly once.

Here the room has walls (a particle outside is impossible: weight 0) and the filter assumes more sensor noise ($\\sigma_r$ = ${SENSOR.sR} m, $\\sigma_b$ = ${SENSOR.sB} rad) and motion noise than the robot really has, so that a sparse cloud does not wipe out the particles nearest the truth: a standard practical tweak.`}
        />
      </More>
    </>
  );

  return <FiltersLayout left={left} right={right} leftRef={leftRef} />;
}
