// Beam-based range-finder model (summary notes §3 "Sensor models"; review deck "What are the components that make
// up the beam-based sensor model?"; Thrun et al. §6.3). Top: the mixture p(z | x, m) as stacked coloured parts
// (hit, short, random; the z_max point mass as a spike), over a histogram of simulated readings. Below it, on the
// same range axis, the beam itself: the wall at z*, people walking past, a glass door, and the last few readings
// coloured by the part that produced them. "Characterise a sensor" hides the parameters: record readings, fit
// them by hand (log-likelihood score) and by EM (core/models_beam.ts fitBeam), then reveal the truth.
import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent, type ReactNode } from 'react';
import type { ExploreItem } from '../../../engine/types';
import {
  BEAM_COMPS,
  components,
  fitBeam,
  emInitialGuess,
  hitNorm,
  histogram,
  logLikelihood,
  mixture,
  normaliseWeights,
  responsibilities,
  sampleBeam,
  shortNorm,
  type BeamComp,
  type BeamFit,
  type BeamParams,
  type BeamWeights,
} from '../../../core/models_beam';
import { mulberry32, makeRng } from '../../../engine/rng';
import { useRaf } from '../../../anim/hooks';
import { Button, Callout, More, Readout, Readouts, Segmented, Slider } from '../../../ui/kit';
import { PredictReveal } from '../../../ui/PredictReveal';
import { Rich, TeX } from '../../../ui/Rich';
import { svgPoint } from '../../../ui/diagrams';
import { completeChallenge, useProgress } from '../../../app/store';
import { headD } from './modelsDraw';
import { fx, g } from './modelsFmt';

const CHALLENGE = 'models-beam-handfit';

export const meta: Omit<ExploreItem, 'component'> = {
  id: 'beam',
  title: 'Beam model: the four-part mixture',
  summary:
    'Build $p(z \\mid x, m)$ from its four coloured parts (hit, short, max, random) with sliders for $z^*$, $z_{max}$, the weights, $\\sigma_{hit}$ and $\\lambda_{short}$. Fire simulated beams in scenarios (clear view, a person walking past, a glass door, sunlight) to build a histogram, point at any reading to see which part explains it, then characterise a hidden sensor by fitting it by hand and by maximum likelihood (EM).',
  notice:
    'Correct readings pile up round the true range $z^*$, unexpected objects add short readings that thin out with distance, misses stack exactly at $z_{max}$, and a flat floor of random readings means no reading ever has zero probability.',
  challenge: { id: CHALLENGE, title: 'Fit a hidden sensor by hand to within 0.02 of EM’s log-likelihood per reading' },
  minutes: 10,
};

const COMP_COLOR: Record<BeamComp, string> = { hit: 'var(--m1)', short: 'var(--m2)', max: 'var(--m3)', rand: 'var(--m4)' };
const COMP_NAME: Record<BeamComp, string> = { hit: 'hit', short: 'short', max: 'max', rand: 'random' };
const COMP_TEX: Record<BeamComp, string> = { hit: 'p_{hit}', short: 'p_{short}', max: 'p_{max}', rand: 'p_{rand}' };
const COMP_WHY: Record<BeamComp, string> = {
  hit: 'the beam reached the wall and came back with measurement noise',
  short: 'something unexpected (a person, clutter) was in front of the wall',
  max: 'nothing came back (glass, a black or shiny surface): the sensor reports $z_{max}$',
  rand: 'an unexplained reading (crosstalk, sunlight, reflections)',
};

// ------------------------------------------------------------------ scenarios

type ScenarioId = 'clear' | 'person' | 'glass' | 'sun';

interface Scenario {
  id: ScenarioId;
  label: string;
  w: BeamWeights;
  lambda: number;
  note: string;
}

export const BEAM_SCENARIOS: Scenario[] = [
  { id: 'clear', label: 'Clear view', w: { hit: 0.9, short: 0.03, max: 0.02, rand: 0.05 }, lambda: 0.6, note: 'Nothing between the sensor and the wall: almost every reading is a hit near $z^*$.' },
  { id: 'person', label: 'Person walking past', w: { hit: 0.55, short: 0.35, max: 0.02, rand: 0.08 }, lambda: 0.7, note: 'People cross the beam in front of the wall: many short readings, more of them near the sensor (the first obstacle along a beam is more likely to be near).' },
  { id: 'glass', label: 'Glass door', w: { hit: 0.45, short: 0.05, max: 0.4, rand: 0.1 }, lambda: 0.6, note: 'The beam often passes straight through the glass and nothing returns: the sensor reports its maximum range $z_{max}$.' },
  { id: 'sun', label: 'Sunlight / crosstalk', w: { hit: 0.6, short: 0.05, max: 0.05, rand: 0.3 }, lambda: 0.6, note: 'Stray light and other sensors trigger random readings anywhere in $[0, z_{max})$: a flat floor under everything.' },
];
const scenarioById = (id: ScenarioId) => BEAM_SCENARIOS.find((s) => s.id === id)!;

const DEFAULT: BeamParams = { zStar: 5, zMax: 8, sigma: 0.2, lambda: 0.6, w: { ...BEAM_SCENARIOS[0].w } };

// ------------------------------------------------------------------ geometry of the figure

const W = 680;
const PL = 54;
const PR = 20;
const PT = 16;
const PH = 280;
const XA = PT + PH;
const ST = XA + 40; // scene strip top
const SH = 104;
const H = ST + SH + 6;
const NB = 64; // histogram bins

interface Reading {
  z: number;
  comp: BeamComp;
  /** For short readings: where the obstacle stood (the reading itself, before noise-free). */
  t: number;
}

function niceCeil(x: number): number {
  if (!(x > 0)) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(x)));
  for (const m of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * p >= x) return m * p;
  return 10 * p;
}

function yTicks(max: number): number[] {
  const step = niceCeil(max / 4.5);
  const out: number[] = [];
  for (let v = 0; v <= max + 1e-9; v += step) out.push(Number(v.toPrecision(6)));
  return out;
}

interface Bands {
  zs: number[];
  rand: number[];
  short: number[];
  hit: number[];
  peak: number;
}

/** The weighted continuous parts sampled finely (z* inserted on both sides so the step of p_short is crisp). */
function bandsOf(p: BeamParams): Bands {
  const w = normaliseWeights(p.w);
  const n = 420;
  const zs: number[] = [];
  for (let i = 0; i <= n; i++) zs.push((p.zMax * i) / n);
  zs.push(Math.max(0, p.zStar - 1e-6), Math.min(p.zMax, p.zStar + 1e-6));
  zs.sort((a, b) => a - b);
  const top = p.zMax - p.zMax / 200;
  const zc = zs.map((z) => Math.min(z, top - 1e-9));
  const rand = zc.map((z) => w.rand * components(z, p).rand);
  const short = zc.map((z) => w.short * components(z, p).short);
  const hit = zc.map((z) => w.hit * components(z, p).hit);
  let peak = 0;
  for (let i = 0; i < zs.length; i++) peak = Math.max(peak, rand[i] + short[i] + hit[i]);
  return { zs, rand, short, hit, peak };
}

// ------------------------------------------------------------------ the figure

function BeamFigure({
  p,
  ghost,
  readings,
  hist,
  scenario,
  cursor,
  pinned,
  onCursor,
  onPin,
  recent,
}: {
  p: BeamParams;
  /** A second model drawn as a dashed outline (characterise mode: the other fit). */
  ghost?: { p: BeamParams; label: string } | null;
  readings: number;
  hist: ReturnType<typeof histogram> | null;
  scenario: ScenarioId | 'hidden';
  cursor: number | null;
  pinned: number | null;
  onCursor: (z: number | null) => void;
  onPin: (z: number | null) => void;
  recent: Reading[];
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const zView = p.zMax * 1.045;
  const sx = (z: number) => PL + (z / zView) * (W - PL - PR);
  const bands = useMemo(() => bandsOf(p), [p]);
  const ghostBands = useMemo(() => (ghost ? bandsOf(ghost.p) : null), [ghost]);
  const bw = p.zMax / NB;
  const histMax = hist && hist.n > 0 ? Math.max(...hist.counts) / (hist.n * bw) : 0;
  const yMax = niceCeil(Math.max(bands.peak, histMax, ghostBands?.peak ?? 0) * 1.12);
  const sy = (d: number) => XA - (Math.min(d, yMax * 1.02) / yMax) * PH;
  const w = normaliseWeights(p.w);

  const area = (lo: number[], hi: number[]) => {
    let d = '';
    for (let i = 0; i < bands.zs.length; i++) d += `${i ? 'L' : 'M'}${sx(bands.zs[i]).toFixed(1)} ${sy(hi[i]).toFixed(1)}`;
    for (let i = bands.zs.length - 1; i >= 0; i--) d += `L${sx(bands.zs[i]).toFixed(1)} ${sy(lo[i]).toFixed(1)}`;
    return d + 'Z';
  };
  const zero = bands.zs.map(() => 0);
  const l1 = bands.rand;
  const l2 = bands.rand.map((v, i) => v + bands.short[i]);
  const l3 = l2.map((v, i) => v + bands.hit[i]);
  const line = (ys: number[], zs: number[]) => zs.map((z, i) => `${i ? 'L' : 'M'}${sx(z).toFixed(1)} ${sy(ys[i]).toFixed(1)}`).join('');
  const ghostTotal = ghostBands ? ghostBands.rand.map((v, i) => v + ghostBands.short[i] + ghostBands.hit[i]) : null;

  const toZ = (e: RPointerEvent<SVGRectElement>) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const pt = svgPoint(svg, e.clientX, e.clientY);
    const z = ((pt.x - PL) / (W - PL - PR)) * zView;
    return Math.max(0, Math.min(p.zMax, z));
  };

  const xStep = p.zMax > 10 ? 2 : 1;
  const xt: number[] = [];
  for (let z = 0; z <= p.zMax + 1e-9; z += xStep) xt.push(z);

  // Spike at z_max: its mass is w.max, drawn as a stem to the top with its weight.
  const sxMax = sx(p.zMax);
  const atMaxFrac = hist && hist.n > 0 ? hist.atMax / hist.n : null;
  const show = pinned ?? cursor;

  // Scene strip (same range axis).
  const lanes = 7;
  const laneY = (k: number) => ST + 16 + (k % lanes) * ((SH - 26) / (lanes - 1));
  const scene: ReactNode[] = [];
  const glass = scenario === 'glass';
  scene.push(<rect key="bg" x={PL - 30} y={ST} width={W - PL - PR + 30} height={SH} rx={8} fill="var(--surface-2)" />);
  scene.push(
    <g key="sensor">
      <rect x={PL - 22} y={ST + SH / 2 - 14} width={20} height={28} rx={4} fill="var(--text-2)" />
      <circle cx={PL - 3} cy={ST + SH / 2} r={5} fill="var(--accent)" />
      <text className="models-tick" x={PL - 12} y={ST + SH - 4} textAnchor="middle">
        sensor
      </text>
    </g>
  );
  if (glass)
    scene.push(
      <g key="wall">
        <rect x={sx(p.zStar) - 4} y={ST + 4} width={8} height={SH - 8} fill="var(--m1)" opacity={0.22} stroke="var(--m1)" strokeWidth={1} />
        <text className="models-tick" x={sx(p.zStar) + 8} y={ST + 13}>
          glass at z*
        </text>
      </g>
    );
  else
    scene.push(
      <g key="wall">
        <rect x={sx(p.zStar)} y={ST + 4} width={7} height={SH - 8} fill="var(--text-2)" />
        <text className="models-tick" x={sx(p.zStar) + 10} y={ST + 13}>
          {scenario === 'hidden' ? 'wall at the known z*' : 'wall at z*'}
        </text>
      </g>
    );
  scene.push(<line key="zmax" x1={sxMax} x2={sxMax} y1={ST + 4} y2={ST + SH - 4} stroke="var(--m3)" strokeWidth={1.4} strokeDasharray="4 3" />);
  scene.push(
    <text key="zmaxt" className="models-tick" x={sxMax - 4} y={ST + SH - 6} textAnchor="end">
      z_max
    </text>
  );
  recent.forEach((r, k) => {
    const age = recent.length - 1 - k;
    const op = Math.max(0.18, 1 - age / recent.length);
    const y = laneY(k);
    const c = COMP_COLOR[r.comp];
    const x0 = PL - 2;
    const x1 = sx(r.comp === 'max' ? p.zMax : r.z);
    scene.push(
      <g key={`r${k}`} opacity={op}>
        <line x1={x0} y1={y} x2={x1} y2={y} stroke={c} strokeWidth={1.8} />
        {r.comp === 'short' && (
          <g>
            <circle cx={x1 + 5} cy={y - 7} r={3.4} fill={c} />
            <line x1={x1 + 5} y1={y - 3.5} x2={x1 + 5} y2={y + 6} stroke={c} strokeWidth={2.4} strokeLinecap="round" />
          </g>
        )}
        {r.comp === 'max' && <path d={`M${x1 - 4} ${y - 4}L${x1 + 4} ${y + 4}M${x1 - 4} ${y + 4}L${x1 + 4} ${y - 4}`} stroke={c} strokeWidth={2} />}
        {r.comp === 'rand' && <path d={`M${x1} ${y - 6}L${x1 + 2} ${y - 2}L${x1 + 6} ${y}L${x1 + 2} ${y + 2}L${x1} ${y + 6}L${x1 - 2} ${y + 2}L${x1 - 6} ${y}L${x1 - 2} ${y - 2}Z`} fill={c} />}
        {r.comp === 'hit' && <circle cx={x1} cy={y} r={3} fill={c} />}
      </g>
    );
  });

  return (
    <svg
      ref={svgRef}
      className="models-svg"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`Beam model mixture over [0, ${g(p.zMax)}] m with z* = ${g(p.zStar)} m; weights hit ${fx(w.hit, 2)}, short ${fx(w.short, 2)}, max ${fx(w.max, 2)}, random ${fx(w.rand, 2)}; ${readings} simulated readings.`}
    >
      {/* axes and grid */}
      {yTicks(yMax).map((v) => (
        <g key={`y${v}`}>
          <line className="models-gridline" x1={PL} x2={W - PR} y1={sy(v)} y2={sy(v)} />
          <text className="models-tick" x={PL - 6} y={sy(v) + 3.5} textAnchor="end">
            {g(v, 3)}
          </text>
        </g>
      ))}
      {xt.map((z) => (
        <g key={`x${z}`}>
          <line className="models-gridline" x1={sx(z)} x2={sx(z)} y1={PT} y2={XA} />
          <text className="models-tick" x={sx(z)} y={XA + 14} textAnchor="middle">
            {g(z)}
          </text>
        </g>
      ))}
      <text className="models-tick" x={W - PR} y={XA + 30} textAnchor="end">
        reading z (m) →
      </text>
      <text className="models-tick" transform={`translate(13 ${PT + PH / 2}) rotate(-90)`} textAnchor="middle">
        density p(z | x, m) (1/m)
      </text>
      {/* histogram of readings (density scale) */}
      {hist && hist.n > 0 && (
        <g fill="var(--text-3)" opacity={0.36} pointerEvents="none">
          {hist.counts.map((c, b) =>
            c ? <rect key={b} x={sx(b * bw) + 0.4} y={sy(c / (hist.n * bw))} width={Math.max(0.5, sx(bw) - sx(0) - 0.8)} height={XA - sy(c / (hist.n * bw))} /> : null
          )}
        </g>
      )}
      {/* the stacked mixture */}
      <g pointerEvents="none">
        <path d={area(zero, l1)} fill={COMP_COLOR.rand} opacity={0.42} />
        <path d={area(l1, l2)} fill={COMP_COLOR.short} opacity={0.42} />
        <path d={area(l2, l3)} fill={COMP_COLOR.hit} opacity={0.42} />
        <path d={line(l3, bands.zs)} fill="none" stroke="var(--text)" strokeWidth={2} />
        {ghostTotal && ghostBands && <path d={line(ghostTotal, ghostBands.zs)} fill="none" stroke="var(--text-2)" strokeWidth={1.8} strokeDasharray="6 4" />}
      </g>
      {/* z* marker */}
      <line x1={sx(p.zStar)} x2={sx(p.zStar)} y1={PT} y2={XA} stroke="var(--text-3)" strokeDasharray="4 4" strokeWidth={1.2} pointerEvents="none" />
      <text className="models-note" x={sx(p.zStar) + 4} y={PT + 12} pointerEvents="none">
        z* = {g(p.zStar, 2)} m
      </text>
      {/* the z_max point mass */}
      <g pointerEvents="none">
        <line x1={sxMax} x2={sxMax} y1={XA} y2={PT + 26} stroke={COMP_COLOR.max} strokeWidth={4} />
        <path d={headD(sxMax, XA, sxMax, PT + 18, 10)} fill={COMP_COLOR.max} />
        <text className="models-note is-strong" x={sxMax - 8} y={PT + 30} textAnchor="end" fill={COMP_COLOR.max}>
          spike at z_max: {Math.round(w.max * 1000) / 10} %
        </text>
        {atMaxFrac !== null && (
          <text className="models-note" x={sxMax - 8} y={PT + 46} textAnchor="end">
            readings at z_max: {Math.round(atMaxFrac * 1000) / 10} %
          </text>
        )}
      </g>
      {/* cursor and pinned reading */}
      {show !== null && (
        <g pointerEvents="none">
          <line x1={sx(show)} x2={sx(show)} y1={PT} y2={ST + SH} stroke={pinned !== null ? 'var(--accent)' : 'var(--text-2)'} strokeWidth={pinned !== null ? 2 : 1.2} />
          <circle cx={sx(show)} cy={sy(mixture(Math.min(show, p.zMax - p.zMax / 200 - 1e-9), p))} r={4.5} fill={pinned !== null ? 'var(--accent)' : 'var(--text)'} />
        </g>
      )}
      {/* scene */}
      {scene}
      {/* pointer layer over the plot and the strip */}
      <rect
        x={PL}
        y={PT}
        width={W - PL - PR}
        height={ST + SH - PT}
        fill="transparent"
        style={{ cursor: 'crosshair' }}
        onPointerMove={(e) => onCursor(toZ(e))}
        onPointerLeave={() => onCursor(null)}
        onClick={(e) => {
          const z = toZ(e as unknown as RPointerEvent<SVGRectElement>);
          onPin(pinned !== null && z !== null && Math.abs(z - pinned) < 0.1 ? null : z);
        }}
      />
    </svg>
  );
}

/** Each part's share of p(z) as a stacked bar, with the winner named. */
function Explain({ z, p }: { z: number; p: BeamParams }) {
  const zz = Math.min(z, p.zMax);
  const atMax = zz >= p.zMax - 1e-9;
  const zEval = atMax ? p.zMax : Math.min(zz, p.zMax - p.zMax / 200 - 1e-9);
  const r = responsibilities(zEval, p);
  const c = components(zEval, p);
  const w = normaliseWeights(p.w);
  const best = BEAM_COMPS.reduce((a, k) => (r[k] > r[a] ? k : a), 'hit' as BeamComp);
  return (
    <div>
      <div className="small" style={{ marginBottom: 4 }}>
        Reading <strong className="models-mono">z = {atMax ? `z_max = ${g(p.zMax)}` : fx(zz, 2)} m</strong>:{' '}
        {atMax ? 'a miss (no return).' : <>p(z) = <span className="models-mono">{fx(mixture(zEval, p), 4)}</span> per metre.</>}
      </div>
      <div className="models-resp" role="img" aria-label={BEAM_COMPS.map((k) => `${COMP_NAME[k]} ${Math.round(r[k] * 100)} %`).join(', ')}>
        {BEAM_COMPS.map((k) => (r[k] > 0.001 ? <span key={k} style={{ width: `${r[k] * 100}%`, background: COMP_COLOR[k] }} title={`${COMP_NAME[k]} ${(r[k] * 100).toFixed(1)} %`} /> : null))}
      </div>
      <div className="models-key" style={{ marginTop: 4 }}>
        {BEAM_COMPS.map((k) => (
          <span key={k}>
            <span className="models-sw is-box" style={{ color: COMP_COLOR[k] }} />
            {COMP_NAME[k]} {Math.round(r[k] * 100)} %
          </span>
        ))}
      </div>
      {!atMax && (
        <div className="models-formula" style={{ marginTop: 6 }}>
          <TeX>{`p(z) = ${fx(w.hit, 2)}(${fx(c.hit, 4)}) + ${fx(w.short, 2)}(${fx(c.short, 4)}) + ${fx(w.max, 2)}(0) + ${fx(w.rand, 2)}(${fx(c.rand, 4)}) = ${fx(mixture(zEval, p), 4)}`}</TeX>
        </div>
      )}
      <Rich className="note" text={`Best explained by **${COMP_NAME[best]}** (${Math.round(r[best] * 100)} %): ${COMP_WHY[best]}.${zz > p.zStar + 3 * p.sigma && !atMax ? ' Beyond $z^*$ the short part is zero: an unexpected object can only be in front of the wall.' : ''}`} />
    </div>
  );
}

// ------------------------------------------------------------------ hidden sensors for "characterise"

interface Hidden {
  p: BeamParams;
  seed: number;
}

function makeHidden(seed: number): Hidden {
  const rng = makeRng(seed);
  const zStar = rng.step(2.5, 5.5, 0.1);
  const hit = rng.step(0.5, 0.78, 0.01);
  const short = rng.step(0.06, 0.24, 0.01);
  const max = rng.step(0.03, 0.12, 0.01);
  const rand = Math.max(0.03, 1 - hit - short - max);
  return {
    seed,
    p: { zStar, zMax: 8, sigma: rng.step(0.08, 0.35, 0.01), lambda: rng.step(0.3, 1.4, 0.05), w: normaliseWeights({ hit, short, max, rand }) },
  };
}

const N_CHAR = 2000;

// ------------------------------------------------------------------ component

export default function BeamModel() {
  const [mode, setMode] = useState<'explore' | 'fit'>('explore');
  const [p, setP] = useState<BeamParams>(DEFAULT);
  const [scenario, setScenario] = useState<ScenarioId>('clear');
  const [cursor, setCursor] = useState<number | null>(null);
  const [pinned, setPinned] = useState<number | null>(null);
  const challengeDone = !!useProgress().challenges[CHALLENGE];

  // readings (explore and characterise keep their own)
  const reads = useRef<Reading[]>([]);
  const [ver, setVer] = useState(0);
  const [streaming, setStreaming] = useState(0); // readings still to fire
  const rngRef = useRef(mulberry32(12345));

  // characterise mode
  const [hidden, setHidden] = useState<Hidden>(() => makeHidden(424242));
  const [guess, setGuess] = useState<BeamParams>(() => ({ zStar: 0, zMax: 8, sigma: 0.5, lambda: 1, w: { hit: 0.5, short: 0.2, max: 0.1, rand: 0.2 } }));
  const charReads = useRef<Reading[]>([]);
  const [emRun, setEmRun] = useState<{ fit: BeamFit; k: number } | null>(null);
  const [emPlaying, setEmPlaying] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const emAcc = useRef(0);

  const fitMode = mode === 'fit';
  const active = fitMode ? charReads : reads;
  const genParams = fitMode ? hidden.p : p;

  // Stream readings a few per frame (refs; one React update per frame).
  useRaf(
    () => {
      const n = Math.min(streaming, fitMode ? 60 : 8);
      const next = rngRef.current;
      for (let k = 0; k < n; k++) {
        const s = sampleBeam(genParams, next);
        active.current.push({ z: s.z, comp: s.comp, t: s.z });
      }
      setStreaming((x) => Math.max(0, x - n));
      setVer((v) => v + 1);
    },
    streaming > 0
  );

  // EM animation: one iteration every 0.18 s.
  useRaf(
    (dt) => {
      if (!emRun) return;
      emAcc.current += dt;
      if (emAcc.current < 0.18) return;
      emAcc.current = 0;
      setEmRun((r) => {
        if (!r) return r;
        const k = Math.min(r.fit.history.length - 1, r.k + 1);
        if (k >= r.fit.history.length - 1) setEmPlaying(false);
        return { ...r, k };
      });
    },
    emPlaying
  );

  const fire = (n: number) => {
    setPinned(null);
    setStreaming((x) => x + n);
  };
  const clear = () => {
    active.current = [];
    setStreaming(0);
    setVer((v) => v + 1);
  };
  const loadScenario = (id: ScenarioId, fireN = 0) => {
    const s = scenarioById(id);
    setScenario(id);
    setP((q) => ({ ...q, w: { ...s.w }, lambda: s.lambda }));
    reads.current = [];
    setVer((v) => v + 1);
    setStreaming(fireN);
  };

  const readings = active.current;
  const hist = useMemo(() => (readings.length ? histogram(readings.map((r) => r.z), genParams.zMax, NB) : null), [ver, genParams.zMax, readings]); // eslint-disable-line react-hooks/exhaustive-deps
  const recent = readings.slice(-14);

  // ---------------------------------------------------------------- characterise: the model shown is the guess (z*, z_max known)
  const guessP: BeamParams = useMemo(() => ({ ...guess, zStar: hidden.p.zStar, zMax: hidden.p.zMax }), [guess, hidden]);
  const zsChar = useMemo(() => (fitMode && charReads.current.length ? charReads.current.map((r) => r.z) : null), [fitMode, ver]); // eslint-disable-line react-hooks/exhaustive-deps
  const recording = fitMode && streaming > 0;
  const llGuess = zsChar && !recording ? logLikelihood(zsChar, guessP) / zsChar.length : null;
  const emBest = useMemo(() => (zsChar && zsChar.length >= N_CHAR ? fitBeam(zsChar, emInitialGuess(hidden.p.zStar, hidden.p.zMax), { maxIter: 300 }) : null), [zsChar, hidden]);
  const llEm = emBest ? emBest.logL / (zsChar?.length || 1) : null;
  const emShown = emRun ? emRun.fit.history[emRun.k].params : null;
  const challengeMet = llGuess !== null && llEm !== null && llEm - llGuess <= 0.02 && !emRun;
  useEffect(() => {
    if (challengeMet && !challengeDone) completeChallenge(CHALLENGE);
  }, [challengeMet, challengeDone]);

  const newHidden = () => {
    setHidden(makeHidden(Math.floor(Math.random() * 900000) + 100000));
    charReads.current = [];
    setEmRun(null);
    setEmPlaying(false);
    setRevealed(false);
    setVer((v) => v + 1);
  };
  const runEm = () => {
    if (!zsChar) return;
    const fit = fitBeam(zsChar, emInitialGuess(hidden.p.zStar, hidden.p.zMax), { maxIter: 60, tol: 1e-6 });
    emAcc.current = 0;
    setEmRun({ fit, k: 0 });
    setEmPlaying(true);
  };

  const shownP = fitMode ? emShown ?? guessP : p;
  const ghost = fitMode && emShown ? { p: guessP, label: 'your fit' } : null;
  const wN = normaliseWeights(p.w);
  const setW = (k: BeamComp, v: number) => setP((q) => ({ ...q, w: { ...q.w, [k]: v } }));
  const setGW = (k: BeamComp, v: number) => setGuess((q) => ({ ...q, w: { ...q.w, [k]: v } }));

  // ---------------------------------------------------------------- panels
  const figure = (
    <div className="models-panel">
      <div className="models-head">
        <h4 style={{ margin: 0 }}>{fitMode ? (emShown ? `EM fit, iteration ${emRun!.k} (dashed: your fit)` : 'Your fit over the recorded readings') : 'p(z | x, m) and simulated readings'}</h4>
        <span className="models-hint">point at a reading to explain it; click to pin</span>
      </div>
      <BeamFigure
        p={shownP}
        ghost={ghost}
        readings={readings.length}
        hist={hist}
        scenario={fitMode ? 'hidden' : scenario}
        cursor={cursor}
        pinned={pinned}
        onCursor={setCursor}
        onPin={setPinned}
        recent={recent}
      />
      <div className="models-key">
        {BEAM_COMPS.map((k) => (
          <span key={k}>
            <span className="models-sw is-box" style={{ color: COMP_COLOR[k] }} />
            <TeX>{`z_{${k === 'rand' ? 'rand' : k}}\\,${COMP_TEX[k]}`}</TeX>
          </span>
        ))}
        <span>
          <span className="models-sw" style={{ color: 'var(--text)' }} />
          total
        </span>
        <span>
          <span className="models-sw is-box" style={{ color: 'var(--text-3)' }} />
          histogram of readings
        </span>
      </div>
      {(pinned ?? cursor) !== null ? (
        <Explain z={(pinned ?? cursor)!} p={shownP} />
      ) : (
        <p className="small muted" style={{ margin: 0 }}>
          Point at the plot (or a beam below it) to see p(z) and which part of the model explains a reading there.
        </p>
      )}
    </div>
  );

  const scenarioPanel = (
    <section className="models-panel">
      <h4>Scenario and readings</h4>
      <Segmented
        size="sm"
        label="Scenario"
        value={scenario}
        onChange={(id) => loadScenario(id)}
        options={BEAM_SCENARIOS.map((s) => ({ value: s.id, label: s.label }))}
      />
      <Rich className="note" text={scenarioById(scenario).note} />
      <div className="models-bar">
        <Button size="sm" variant="primary" onClick={() => fire(400)}>
          Fire 400 beams
        </Button>
        <Button size="sm" onClick={() => fire(1)}>
          Fire 1
        </Button>
        <Button size="sm" onClick={clear} disabled={!readings.length}>
          Clear
        </Button>
        <span className="small muted">{readings.length} readings</span>
      </div>
    </section>
  );

  const paramPanel = (
    <section className="models-panel">
      <h4>Model parameters</h4>
      <div className="models-sliders">
        <Slider label="expected range" tex="z^*" tip="What a perfect sensor would read: the ray-cast distance to the wall at this pose (m)" value={p.zStar} min={0.5} max={p.zMax - 0.3} step={0.05} unit="m" onChange={(v) => setP((q) => ({ ...q, zStar: v }))} />
        <Slider label="maximum range" tex="z_{max}" tip="The sensor's maximum range (m); a miss reads exactly this" value={p.zMax} min={3} max={12} step={0.5} unit="m" onChange={(v) => setP((q) => ({ ...q, zMax: v, zStar: Math.min(q.zStar, v - 0.3) }))} />
        <Slider label="hit spread" tex="\sigma_{hit}" tip="Standard deviation of correct readings round z* (m)" value={p.sigma} min={0.03} max={1} step={0.01} unit="m" onChange={(v) => setP((q) => ({ ...q, sigma: v }))} />
        <Slider label="short decay" tex="\lambda_{short}" tip="How fast the chance of an unexpected obstacle falls off with range (1/m)" value={p.lambda} min={0.1} max={3} step={0.05} unit="1/m" onChange={(v) => setP((q) => ({ ...q, lambda: v }))} />
      </div>
      <div className="models-label" style={{ marginTop: 8 }}>
        weights (normalised to sum to 1)
      </div>
      <div className="models-sliders">
        {BEAM_COMPS.map((k) => (
          <Slider
            key={k}
            label={`→ ${fx(wN[k], 2)}`}
            tex={`z_{${k}}`}
            tip={`Raw weight of the ${COMP_NAME[k]} part; it is divided by the sum of all four, giving ${fx(wN[k], 3)}`}
            value={p.w[k]}
            min={0}
            max={1}
            step={0.01}
            format={(v) => v.toFixed(2)}
            onChange={(v) => setW(k, v)}
          />
        ))}
      </div>
      <Readouts min={118}>
        <Readout tex="\eta_{hit}" value={hitNorm(p.zStar, p.sigma, p.zMax)} sig={5} tip="1 / (area of the Gaussian inside [0, z_max]); just above 1 when the Gaussian is cut off at an end" />
        <Readout tex="\eta_{short}" value={shortNorm(p.zStar, p.lambda)} sig={4} tip="1 / (1 − e^{−λ z*}): rescales the exponential cut off at z*" />
        <Readout tex="p_{rand}" value={1 / p.zMax} unit="1/m" tip="Uniform density 1/z_max" />
        <Readout label="mean log p per reading" text={readings.length && !streaming ? fx(logLikelihood(readings.map((r) => r.z), p) / readings.length, 3) : '—'} tip="Average ln p(z) of the readings under these parameters: higher means the model explains them better" />
      </Readouts>
    </section>
  );

  const predictions = (
    <section className="models-panel">
      <h4>Predict, then check</h4>
      <PredictReveal
        id="models-beam-sigma"
        question="Double $\sigma_{hit}$ from 0.2 m to 0.4 m. What happens to the hit peak?"
        options={['Half as tall and twice as wide: its area stays $z_{hit}$', 'Twice as tall', 'It moves further away', 'Nothing: σ only changes the histogram']}
        answer={0}
        explain="Each part is a probability density times its weight, so the area under the hit part is always $z_{hit}$. Spreading it twice as wide must halve its height. A noisier sensor says “the wall is about here” less sharply."
        tryIt="set σ_hit to 0.4 m and compare the blue peak."
        onApply={() => {
          setMode('explore');
          setP((q) => ({ ...q, sigma: 0.4 }));
        }}
      />
      <PredictReveal
        id="models-beam-person"
        question="People start walking between the sensor and the wall. Where do the extra readings land?"
        options={['In front of the wall, more of them close to the sensor', 'Spread evenly over the whole range', 'Behind the wall', 'At $z_{max}$']}
        answer={0}
        explain="A person blocks the beam before it reaches the wall, so the reading is short: $p_{short}$ lives only on $[0, z^*]$. It decays exponentially because the beam stops at the **first** obstacle: an obstacle near the sensor hides any further ones, so short readings are likelier near than far."
        tryIt="pick “Person walking past” and fire 400 beams."
        onApply={() => {
          setMode('explore');
          loadScenario('person', 400);
        }}
      />
      <PredictReveal
        id="models-beam-glass"
        question="The wall is replaced by a glass door. Where do the extra readings go?"
        options={['Into a spike at exactly $z_{max}$', 'Into the hit peak, which gets wider', 'Into short readings just in front of the door']}
        answer={0}
        explain="Most of the beam passes through glass (or is absorbed by a black surface, or reflected away by a shiny one), so no echo returns and the sensor reports its maximum range. That is the $p_{max}$ point mass. Treating those readings as real obstacles at $z_{max}$ would be wrong, which is why the model has a separate part for them."
        tryIt="pick “Glass door” and fire 400 beams."
        onApply={() => {
          setMode('explore');
          loadScenario('glass', 400);
        }}
      />
      <PredictReveal
        id="models-beam-beyond"
        question="A reading lands 1.5 m **beyond** the wall ($z = z^* + 1.5$ m). Which parts of the model can explain it?"
        options={['Only the random part', 'Short and random', 'Hit and short', 'All four']}
        answer={0}
        explain="Short readings exist only in front of the wall, the hit Gaussian is negligible 1.5 m ($7.5\sigma$) away, and $p_{max}$ is only at $z_{max}$. Only the uniform $p_{rand}$ is left, which is exactly why it is there: without it, one odd reading would make the likelihood of the whole scan zero."
        tryIt="click on the plot 1.5 m right of z* to pin a reading there."
        onApply={() => {
          setMode('explore');
          setP((q) => ({ ...q, sigma: 0.2 }));
          setPinned(Math.min(p.zMax - 0.3, p.zStar + 1.5));
        }}
      />
    </section>
  );

  // ---------------------------------------------------------------- characterise panels
  const hiddenNote = `A sensor with **hidden** parameters is pointed at a wall at a known $z^* = ${g(hidden.p.zStar, 2)}$ m ($z_{max} = ${g(hidden.p.zMax)}$ m). Record readings, then find the weights, $\\sigma_{hit}$ and $\\lambda_{short}$ that make the readings most likely.`;
  const gN = normaliseWeights(guess.w);
  const emP = emShown;
  const row = (label: string, yours: string, em: string, truth: string) => (
    <tr key={label}>
      <td className="models-txt">
        <Rich text={label} inline />
      </td>
      <td>{yours}</td>
      <td>{em}</td>
      <td>{revealed ? truth : '?'}</td>
    </tr>
  );
  const hw = hidden.p.w;
  const fitPanel = (
    <section className="models-panel">
      <h4>Characterise a sensor</h4>
      <Rich className="note" text={hiddenNote} />
      <div className="models-bar">
        <Button size="sm" variant="primary" disabled={streaming > 0 || charReads.current.length >= N_CHAR} onClick={() => fire(N_CHAR - charReads.current.length)}>
          Record {N_CHAR} readings
        </Button>
        <Button size="sm" onClick={newHidden}>
          New hidden sensor
        </Button>
        <span className="small muted">{charReads.current.length} recorded</span>
      </div>
      <div className="models-label">your fit</div>
      <div className="models-sliders">
        <Slider label="" tex="\sigma_{hit}" tip="Your guess of the hit spread (m)" value={guess.sigma} min={0.03} max={1} step={0.01} unit="m" onChange={(v) => setGuess((q) => ({ ...q, sigma: v }))} />
        <Slider label="" tex="\lambda_{short}" tip="Your guess of the short decay rate (1/m)" value={guess.lambda} min={0.1} max={3} step={0.05} unit="1/m" onChange={(v) => setGuess((q) => ({ ...q, lambda: v }))} />
        {BEAM_COMPS.map((k) => (
          <Slider key={k} label={`→ ${fx(gN[k], 2)}`} tex={`z_{${k}}`} tip={`Your raw ${COMP_NAME[k]} weight (normalised to ${fx(gN[k], 3)})`} value={guess.w[k]} min={0} max={1} step={0.01} format={(v) => v.toFixed(2)} onChange={(v) => setGW(k, v)} />
        ))}
      </div>
      <div className="models-two">
        <div>
          <div className="small">your mean ln p(z)</div>
          <div className="models-mono">{llGuess === null ? '—' : fx(llGuess, 3)}</div>
        </div>
        <div>
          <div className="small">best possible (EM)</div>
          <div className="models-mono">{llEm === null ? (charReads.current.length ? '…' : '—') : fx(llEm, 3)}</div>
        </div>
      </div>
      {llGuess !== null && llEm !== null && (
        <div className="models-scorebar" title="How close your fit is to the maximum-likelihood fit">
          <span style={{ width: `${Math.max(3, Math.min(100, 100 - (llEm - llGuess) * 100))}%`, background: llEm - llGuess <= 0.02 ? 'var(--ok)' : 'var(--accent)' }} />
        </div>
      )}
      {challengeMet || challengeDone ? (
        <Callout kind="ok" title="Within 0.02 of maximum likelihood">
          <Rich text="That is characterising a sensor: pick the parameters under which the recorded readings are most probable. EM does the same search automatically." />
        </Callout>
      ) : null}
      <div className="models-bar">
        <Button size="sm" variant="primary" disabled={!zsChar || charReads.current.length < N_CHAR || emPlaying} onClick={runEm}>
          {emRun ? 'Run EM again' : 'Run EM (maximum likelihood)'}
        </Button>
        <Button size="sm" onClick={() => setRevealed(true)} disabled={revealed || !emRun}>
          Reveal the hidden sensor
        </Button>
        {emRun && (
          <Button size="sm" variant="ghost" onClick={() => (setEmRun(null), setEmPlaying(false))}>
            Back to my fit
          </Button>
        )}
      </div>
      <div className="models-table-wrap">
        <table className="models-table">
          <thead>
            <tr>
              <th className="models-txt">parameter</th>
              <th>yours</th>
              <th>EM{emRun ? ` (it. ${emRun.k})` : ''}</th>
              <th>hidden</th>
            </tr>
          </thead>
          <tbody>
            {BEAM_COMPS.map((k) => row(`$z_{${k}}$`, fx(gN[k], 3), emP ? fx(normaliseWeights(emP.w)[k], 3) : '—', fx(hw[k], 3)))}
            {row('$\\sigma_{hit}$ (m)', fx(guess.sigma, 3), emP ? fx(emP.sigma, 3) : '—', fx(hidden.p.sigma, 3))}
            {row('$\\lambda_{short}$ (1/m)', fx(guess.lambda, 3), emP ? fx(emP.lambda, 3) : '—', fx(hidden.p.lambda, 3))}
            {row('mean $\\ln p(z)$', llGuess === null ? '—' : fx(llGuess, 3), emRun ? fx(emRun.fit.history[emRun.k].logL / (zsChar?.length || 1), 3) : '—', zsChar ? fx(logLikelihood(zsChar, hidden.p) / zsChar.length, 3) : '—')}
          </tbody>
        </table>
      </div>
      <More label="What EM does each iteration">
        <Rich
          text={`- **E-step:** for every reading, the share of each part, $e_{i,k} = z_k\\,p_k(z_i) / p(z_i)$ (the bar under the plot, for every reading at once).
- **M-step:** each weight becomes the average share, $z_k = \\frac{1}{N}\\sum_i e_{i,k}$; $\\sigma_{hit}^2 = \\sum_i e_{i,hit}(z_i - z^*)^2 / \\sum_i e_{i,hit}$; $\\lambda_{short}$ makes the mean of the short-weighted readings match the truncated exponential’s mean.
- Repeat. The log-likelihood never decreases, and with 2000 readings the fit lands close to the hidden values (the hidden column is one random draw, so the fit will not match it exactly).`}
        />
      </More>
    </section>
  );

  return (
    <div className="models-sim">
      <div className="models-bar" style={{ marginBottom: 10 }}>
        <Segmented
          label="Mode"
          value={mode}
          onChange={(m) => {
            setMode(m);
            setPinned(null);
            setStreaming(0);
          }}
          options={[
            { value: 'explore', label: 'Explore the model' },
            { value: 'fit', label: 'Characterise a sensor' },
          ]}
        />
      </div>
      <div className="models-layout">
        <div className="models-left">{figure}</div>
        <div className="models-right">
          {fitMode ? (
            fitPanel
          ) : (
            <>
              {scenarioPanel}
              {paramPanel}
            </>
          )}
          {predictions}
        </div>
      </div>
      <More label="The four parts and their normalisers (Thrun Table 6.1)">
        <Rich
          text={`$$p(z \\mid x, m) = z_{hit}\\,p_{hit} + z_{short}\\,p_{short} + z_{max}\\,p_{max} + z_{rand}\\,p_{rand}, \\qquad z_{hit} + z_{short} + z_{max} + z_{rand} = 1$$
- $p_{hit}(z) = \\eta\\,\\mathcal N(z; z^*, \\sigma_{hit}^2)$ on $[0, z_{max}]$, with $\\eta$ making the cut-off Gaussian integrate to 1.
- $p_{short}(z) = \\eta\\,\\lambda e^{-\\lambda z}$ on $[0, z^*]$, with $\\eta = 1/(1 - e^{-\\lambda z^*})$.
- $p_{max}(z) = 1$ if $z = z_{max}$, else 0 (a point mass; drawn here as a spike).
- $p_{rand}(z) = 1/z_{max}$ on $[0, z_{max})$.
- $z^*$ comes from ray casting the map at the hypothesised pose, so the beam model needs a ray cast per beam. A whole scan’s likelihood is the product over its beams (beams treated as independent).`}
        />
      </More>
    </div>
  );
}
