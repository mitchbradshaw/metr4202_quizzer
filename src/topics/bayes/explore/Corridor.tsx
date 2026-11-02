// Corridor localisation (grid1d): the classic 1-D histogram filter. A robot in a looped corridor with doors is
// told to move one cell right (Predict: every bar splits into stay / 1 cell / 2 cell pieces that slide and add,
// so the belief blurs) and senses door or no door (Correct: prior × likelihood = product, Σ = P(z), × η =
// posterior, so the belief sharpens). The hidden robot can be revealed; entropy is tracked step by step.
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ExploreItem } from '../../../engine/types';
import { argmax, countModes, effectiveCells, entropyBits, type CorridorEnds, type DoorReading } from '../../../core/bayes1d';
import { Button, More, Readout, Readouts, Segmented, Select, Slider, Toggle } from '../../../ui/kit';
import { PredictReveal } from '../../../ui/PredictReveal';
import { Rich } from '../../../ui/Rich';
import { Dot, Line, Plot } from '../../../plot/Plot';
import { useRaf } from '../../../anim/hooks';
import { BayesLayout, Panel, f2, f3, revealVisual, useRand, useTween } from './common';
import { CORRIDOR_PRESETS, DEFAULT_PARAMS, doCorrect, doPredict, doorsOf, initSnap, type Params, type Snap } from './corridorModel';

export const meta: Omit<ExploreItem, 'component'> = {
  id: 'grid1d',
  title: 'Corridor localisation: predict, then correct',
  summary:
    'A robot in a corridor with doors keeps a belief over 30 cells. **Predict** moves it one cell right with motion noise; **Correct** senses door or no door. Each step is animated piece by piece, with the uncertainty (entropy) tracked as it grows and shrinks.',
  notice:
    'Predict always spreads the bars out (entropy goes up); Correct always sharpens them where the reading fits (entropy goes down). After the first “door” there is one peak **per door**, and only the pattern of later readings tells the doors apart.',
  minutes: 10,
};

const VW = 720;
const PAD_L = 40;
const PAD_R = 8;
const STRIP_T = 6;
const STRIP_H = 48;
const BEL_T = 70;
const BEL_H = 132;
const TOP_H = BEL_T + BEL_H + 24;
const PIECE_COL = ['var(--m4)', 'var(--m1)', 'var(--m2)'];
const PIECE_NAME = ['stays', 'moves 1', 'moves 2'];

const NICE = [0.04, 0.05, 0.08, 0.1, 0.15, 0.2, 0.3, 0.4, 0.5, 0.6, 0.8, 1];
const niceMax = (m: number) => NICE.find((v) => v >= m * 1.06) ?? 1;
const fmtTick = (v: number) => (v >= 0.1 ? v.toFixed(1) : v.toFixed(2));

interface Geo {
  n: number;
  cw: number;
  x: (i: number) => number;
}
const geoOf = (n: number): Geo => {
  const cw = (VW - PAD_L - PAD_R) / n;
  return { n, cw, x: (i: number) => PAD_L + i * cw };
};

function setBar(el: SVGRectElement | null | undefined, v: number, yMax: number, top: number, h: number) {
  if (!el) return;
  const hh = Math.max(0, Math.min(h, (v / yMax) * h));
  el.setAttribute('y', String(top + h - hh));
  el.setAttribute('height', String(hh));
}

const barY = (v: number, yMax: number, top: number, h: number) => top + h - Math.max(0, Math.min(h, (v / yMax) * h));
const barH = (v: number, yMax: number, h: number) => Math.max(0, Math.min(h, (v / yMax) * h));

type Action = 'p' | 'c';

export default function Corridor() {
  const [presetId, setPresetId] = useState('classic');
  const [doors, setDoors] = useState<boolean[]>(() => doorsOf(CORRIDOR_PRESETS[0]));
  const [params, setParams] = useState<Params>(DEFAULT_PARAMS);
  const [showRobot, setShowRobot] = useState(false);
  const rand = useRand(20261102);
  const [hist, setHist] = useState<Snap[]>(() => [initSnap(doorsOf(CORRIDOR_PRESETS[0]), 12, DEFAULT_PARAMS.sensor, () => 0.37)]);
  const [auto, setAuto] = useState(false);
  const [speed, setSpeed] = useState(1);
  const leftRef = useRef<HTMLDivElement>(null);
  const cellRefs = useRef<(SVGRectElement | null)[]>([]);
  const [curCell, setCurCell] = useState(0);
  const tween = useTween();
  const busyUntil = useRef(0);
  const queue = useRef<Action[]>([]);
  const skipAnim = useRef(false);

  const snap = hist[hist.length - 1];
  const prev = hist.length > 1 ? hist[hist.length - 2] : null;
  const step = snap.step;
  const n = doors.length;
  const G = useMemo(() => geoOf(n), [n]);

  // ---------------------------------------------------------------- actions
  const paramsRef = useRef(params);
  paramsRef.current = params;
  const doorsRef = useRef(doors);
  doorsRef.current = doors;
  const act = (a: Action, z?: DoorReading) => {
    setHist((h) => {
      const s = h[h.length - 1];
      const next = a === 'p' ? doPredict(s, doorsRef.current, paramsRef.current, rand) : doCorrect(s, doorsRef.current, z ?? s.reading, paramsRef.current, rand);
      const out = [...h, next];
      return out.length > 400 ? out.slice(out.length - 400) : out;
    });
  };
  const back = () => {
    if (hist.length < 2) return;
    skipAnim.current = true;
    queue.current = [];
    setAuto(false);
    setHist((h) => (h.length > 1 ? h.slice(0, -1) : h));
  };
  const reset = (robot?: number, d = doors) => {
    queue.current = [];
    skipAnim.current = true;
    setHist([initSnap(d, robot ?? Math.floor(rand() * d.length), paramsRef.current.sensor, rand)]);
  };
  const loadPreset = (id: string, robot?: number) => {
    const p = CORRIDOR_PRESETS.find((x) => x.id === id) ?? CORRIDOR_PRESETS[0];
    const d = doorsOf(p);
    setPresetId(p.id);
    setDoors(d);
    doorsRef.current = d;
    reset(robot, d);
  };
  const toggleDoor = (i: number) => {
    setDoors((d) => d.map((x, k) => (k === i ? !x : x)));
    setPresetId('custom');
  };
  const setMotion = (key: 'under' | 'over', v: number) =>
    setParams((p) => {
      const other = key === 'under' ? p.motion.over : p.motion.under;
      const val = Math.min(v, 1 - other);
      const m = { ...p.motion, [key]: val };
      m.exact = Math.max(0, 1 - m.under - m.over);
      return { ...p, motion: m };
    });

  // Auto-play and queued demo steps: one action whenever the previous animation has finished.
  const dur = (a: Action) => (a === 'p' ? 700 : 950) / speed;
  useRaf(
    () => {
      const now = performance.now();
      if (now < busyUntil.current) return;
      let a = queue.current.shift();
      if (!a && auto) a = step?.kind === 'predict' ? 'c' : 'p';
      if (!a) return;
      busyUntil.current = now + dur(a) + 260 / speed;
      act(a);
    },
    auto || queue.current.length > 0
  );
  const [, force] = useState(0);
  const runQueue = (acts: Action[]) => {
    queue.current = acts;
    busyUntil.current = 0;
    force((x) => x + 1);
  };

  // ---------------------------------------------------------------- animation of the newest step
  const topBars = useRef<(SVGRectElement | null)[]>([]);
  const pieceRefs = useRef<(SVGRectElement | null)[]>([]);
  const prodRefs = useRef<(SVGRectElement | null)[]>([]);
  const postRefs = useRef<(SVGRectElement | null)[]>([]);
  const etaRef = useRef<SVGTextElement | null>(null);

  const yTop = niceMax(Math.max(...snap.bel, ...(step ? step.before : [])));
  const brk = useMemo(() => breakdownGeo(step, n), [step, n]);

  const animated = useRef<Snap | null>(null);
  useLayoutEffect(() => {
    if (animated.current === snap) return;
    animated.current = snap;
    if (!step || skipAnim.current) {
      skipAnim.current = false;
      return;
    }
    const before = step.before;
    const after = snap.bel;
    const ms = dur(step.kind === 'predict' ? 'p' : 'c');
    busyUntil.current = Math.max(busyUntil.current, performance.now() + ms);
    if (step.kind === 'predict') {
      const pg = brk.pieces!;
      tween(ms, (p) => {
        for (let i = 0; i < n; i++) setBar(topBars.current[i], before[i] + (after[i] - before[i]) * p, yTop, BEL_T, BEL_H);
        pg.forEach((g, j) => {
          const el = pieceRefs.current[j];
          if (!el) return;
          let xc = g.from + g.travel * p;
          if (xc > n - 0.5) xc -= n; // a piece that wraps round the loop re-enters on the left
          const off = g.yFrom + (g.yTo - g.yFrom) * p;
          const hh = barH(g.mass, brk.yMax, BRK_H);
          el.setAttribute('x', String(G.x(xc) + 1.5));
          el.setAttribute('y', String(BRK_T + BRK_H - barH(off, brk.yMax, BRK_H) - hh));
        });
      });
    } else {
      const lik = step.lik;
      const ev = step.evidence;
      tween(ms, (p) => {
        for (let i = 0; i < n; i++) setBar(topBars.current[i], before[i] + (after[i] - before[i]) * p, yTop, BEL_T, BEL_H);
        const p1 = Math.min(1, p / 0.55);
        const p2 = Math.max(0, (p - 0.45) / 0.55);
        for (let i = 0; i < n; i++) {
          const prod = before[i] * (1 + (lik[i] - 1) * p1);
          setBar(prodRefs.current[i], prod, brk.yProd, rowTop(2), ROW_H);
          setBar(postRefs.current[i], (ev > 0 ? step.product[i] / ev : before[i]) * p2, brk.yPost, rowTop(3), ROW_H);
        }
        etaRef.current?.setAttribute('opacity', String(p2));
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snap]);

  // ---------------------------------------------------------------- derived numbers
  const H = entropyBits(snap.bel);
  const Hprev = prev ? entropyBits(prev.bel) : NaN;
  const dH = H - Hprev;
  const modes = countModes(snap.bel, 0.3, params.ends === 'loop');
  const best = argmax(snap.bel);
  const series = useMemo(() => hist.map((s, k) => ({ k, h: entropyBits(s.bel), kind: s.step?.kind ?? 'start' })), [hist]);
  const kMin = Math.max(0, series.length - 41);
  const shown = series.slice(kMin);
  const preset = CORRIDOR_PRESETS.find((p) => p.id === presetId);

  const setup = (fn: () => void) => {
    setAuto(false);
    fn();
    revealVisual(leftRef.current);
  };

  // ---------------------------------------------------------------- render
  const robotX = G.x(snap.robot) + G.cw / 2;
  const top = (
    <svg className="bayes-corridor-svg" viewBox={`0 0 ${VW} ${TOP_H}`} width="100%" role="group" aria-label={`Corridor of ${n} cells with doors at ${doors.map((d, i) => (d ? i + 1 : 0)).filter(Boolean).join(', ')}. Belief peaks at cell ${best + 1} with ${f3(snap.bel[best])}.`}>
      {/* corridor strip */}
      <rect x={PAD_L} y={STRIP_T} width={n * G.cw} height={STRIP_H} fill="var(--surface-2)" stroke="var(--text-3)" strokeWidth={1} />
      {doors.map((d, i) =>
        d ? (
          <g key={`d${i}`} pointerEvents="none">
            <rect x={G.x(i) + 3} y={STRIP_T + 6} width={G.cw - 6} height={STRIP_H - 6} rx={2} fill="var(--m2)" opacity={0.85} />
            <circle cx={G.x(i) + G.cw - 7} cy={STRIP_T + STRIP_H / 2 + 4} r={1.8} fill="var(--surface)" />
          </g>
        ) : null
      )}
      {doors.map((d, i) => (
        <rect
          key={`hit${i}`}
          ref={(el) => {
            cellRefs.current[i] = el;
          }}
          className="bayes-cell-hit"
          x={G.x(i)}
          y={STRIP_T}
          width={G.cw}
          height={STRIP_H}
          fill="transparent"
          role="button"
          // One Tab stop for the whole strip; ← → move between cells.
          tabIndex={i === Math.min(curCell, n - 1) ? 0 : -1}
          aria-label={`Cell ${i + 1}: ${d ? 'door' : 'wall'}. Toggle door (arrow keys move between cells).`}
          onClick={() => {
            setCurCell(i);
            toggleDoor(i);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              toggleDoor(i);
            } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
              e.preventDefault();
              const j = Math.max(0, Math.min(n - 1, i + (e.key === 'ArrowRight' ? 1 : -1)));
              setCurCell(j);
              cellRefs.current[j]?.focus();
            }
          }}
        >
          <title>{`Cell ${i + 1}: ${d ? 'door' : 'wall'} (click to toggle)`}</title>
        </rect>
      ))}
      {showRobot && (
        <g pointerEvents="none" className="bayes-robot">
          <circle cx={robotX} cy={STRIP_T + STRIP_H - 13} r={9.5} fill="var(--m3)" stroke="var(--surface)" strokeWidth={2} />
          <path d={`M${robotX + 3} ${STRIP_T + STRIP_H - 17} L${robotX + 8} ${STRIP_T + STRIP_H - 13} L${robotX + 3} ${STRIP_T + STRIP_H - 9} Z`} fill="var(--surface)" />
        </g>
      )}
      {/* belief bars */}
      {[0, yTop / 2, yTop].map((v) => (
        <g key={`t${v}`}>
          <line x1={PAD_L} x2={VW - PAD_R} y1={barY(v, yTop, BEL_T, BEL_H)} y2={barY(v, yTop, BEL_T, BEL_H)} className="bayes-gridline" />
          <text x={PAD_L - 5} y={barY(v, yTop, BEL_T, BEL_H) + 4} textAnchor="end" className="bayes-tick">
            {fmtTick(v)}
          </text>
        </g>
      ))}
      <text x={6} y={BEL_T - 10} className="bayes-axis-label">
        bel(x)
      </text>
      {showRobot && <line x1={robotX} x2={robotX} y1={BEL_T - 4} y2={BEL_T + BEL_H} stroke="var(--m3)" strokeWidth={1.5} strokeDasharray="4 3" />}
      {snap.bel.map((v, i) => (
        <rect
          key={`b${i}`}
          ref={(el) => {
            topBars.current[i] = el;
          }}
          x={G.x(i) + 1.5}
          width={G.cw - 3}
          y={barY(v, yTop, BEL_T, BEL_H)}
          height={barH(v, yTop, BEL_H)}
          fill="var(--m1)"
          rx={1.5}
        >
          <title>{`Cell ${i + 1}: bel = ${v.toFixed(4)}`}</title>
        </rect>
      ))}
      {Array.from({ length: n }, (_, i) =>
        i === 0 || (i + 1) % 5 === 0 ? (
          <text key={`x${i}`} x={G.x(i) + G.cw / 2} y={BEL_T + BEL_H + 15} textAnchor="middle" className="bayes-tick">
            {i + 1}
          </text>
        ) : null
      )}
    </svg>
  );

  const readingTxt = (z: DoorReading) => (z === 'door' ? 'door' : 'no door');
  const actions = (
    <div className="bayes-actions">
      <Button variant="primary" onClick={() => act('p')} title="Prediction step: the robot is told to move one cell to the right">
        ▶ Predict: move right
      </Button>
      {(['door', 'wall'] as DoorReading[]).map((z) => (
        <Button
          key={z}
          className={snap.reading === z ? 'bayes-suggest' : ''}
          onClick={() => act('c', z)}
          title={`Correction step with the reading “${readingTxt(z)}”${snap.reading === z ? ' (what the robot’s sensor reads now)' : ' (forces the opposite of the robot’s reading)'}`}
        >
          Correct: saw {z === 'door' ? 'a door' : 'no door'}
          {snap.reading === z && <span className="bayes-tag">sensor</span>}
        </Button>
      ))}
      <span className="bayes-reading" aria-live="polite">
        the robot’s sensor reads <strong>{readingTxt(snap.reading)}</strong>
      </span>
    </div>
  );
  const transport = (
    <div className="bayes-actions">
      <Button size="sm" onClick={back} disabled={hist.length < 2} aria-label="Undo the last step">
        ◀ Back
      </Button>
      <Button size="sm" onClick={() => reset()} aria-label="Start again from a uniform belief with the robot somewhere new">
        ↺ Reset
      </Button>
      <Button size="sm" variant={auto ? 'primary' : 'default'} onClick={() => setAuto((a) => !a)} aria-label={auto ? 'Pause auto-run' : 'Auto-run predict and correct with the robot’s readings'}>
        {auto ? '⏸ Pause' : '⏵ Auto-run'}
      </Button>
      <Segmented size="sm" label="Animation speed" value={speed} onChange={setSpeed} options={[1, 2, 4].map((s) => ({ value: s, label: `${s}×` }))} />
      <Toggle checked={showRobot} onChange={setShowRobot} label="Show the true robot" />
    </div>
  );

  const left = (
    <div ref={leftRef} className="bayes-panel bayes-left-stack">
      {top}
      {actions}
      {transport}
      <Breakdown snap={snap} geo={G} brk={brk} pieceRefs={pieceRefs} prodRefs={prodRefs} postRefs={postRefs} etaRef={etaRef} />
    </div>
  );

  const right = (
    <>
      <Panel title="How uncertain is the robot?" live>
        <Readouts min={118}>
          <Readout label="Step" text={String(snap.t)} tip="Steps taken (each predict or correct counts as one)" />
          <Readout label="Entropy H" text={`${f2(H)} bits`} tip="H = −Σ bel(x) log₂ bel(x): 0 when certain, log₂ 30 ≈ 4.91 bits when uniform over 30 cells" tone="m1" />
          <Readout label="Change" text={Number.isFinite(dH) ? `${dH >= 0 ? '+' : '−'}${f2(Math.abs(dH))} ${dH > 0.005 ? '▲' : dH < -0.005 ? '▼' : ''}` : '—'} tip="Entropy change in the last step: predict raises it, correct lowers it" tone={Number.isFinite(dH) ? (dH > 0.005 ? 'warn' : dH < -0.005 ? 'ok' : undefined) : undefined} />
          <Readout label="Spread 2^H" text={`${effectiveCells(snap.bel).toFixed(1)} cells`} tip="2^H: the belief is as uncertain as a uniform spread over this many cells" />
          <Readout label="Peaks" text={modes === 0 ? 'none (flat)' : String(modes)} tip="Separate bumps in the belief (cells within 30 % of the top, grouped)" />
          <Readout label="Most likely" text={modes === 0 ? '— (flat)' : `cell ${best + 1}: ${f3(snap.bel[best])}`} tip="argmax bel(x) and its probability" />
          {step?.kind === 'correct' && <Readout label="P(z)" text={f3(step.evidence)} tip="Evidence: Σ P(z | x) b̅e̅l̅(x), the sum of the products" />}
          {step?.kind === 'correct' && <Readout label="η = 1/P(z)" text={step.evidence > 0 ? f2(1 / step.evidence) : '—'} tip="The normaliser that rescales the products to sum to 1" />}
          {showRobot && <Readout label="bel(true cell)" text={`cell ${snap.robot + 1}: ${f3(snap.bel[snap.robot])}`} tip="Belief at the robot's real position" tone="m3" />}
        </Readouts>
        <Plot x={{ min: shown[0]?.k ?? 0, max: Math.max((shown[0]?.k ?? 0) + 10, series.length - 1), label: 'step' }} y={{ min: 0, max: Math.log2(n) + 0.2, label: 'H (bits)' }} height={150} ariaLabel="Entropy of the belief after every step">
          <Line points={shown.map((s) => [s.k, s.h] as const)} color="var(--text-3)" width={1.5} />
          {shown.map((s) => (
            <Dot key={s.k} x={s.k} y={s.h} r={3.2} color={s.kind === 'predict' ? 'var(--m2)' : s.kind === 'correct' ? 'var(--m1)' : 'var(--text-3)'} />
          ))}
        </Plot>
        <p className="small muted bayes-tight">
          <span className="bayes-dot" style={{ background: 'var(--m2)' }} /> after predict &nbsp; <span className="bayes-dot" style={{ background: 'var(--m1)' }} /> after correct. A sawtooth: up on every move, down on every reading.
        </p>
      </Panel>

      <Panel title="Motion and sensor models">
        <Slider label="stays put (undershoot)" tex="p(\text{stay})" tip="Probability that the robot does not move when told to move one cell" value={params.motion.under} min={0} max={0.5} step={0.05} onChange={(v) => setMotion('under', v)} />
        <Slider label="overshoots 2 cells" tex="p(+2)" tip="Probability that the robot moves two cells instead of one" value={params.motion.over} min={0} max={0.5} step={0.05} onChange={(v) => setMotion('over', v)} />
        <p className="small muted bayes-tight">
          Moves exactly 1 cell: <strong className="mono">{f2(params.motion.exact)}</strong>
        </p>
        <Slider label="hit rate" tex="P(\text{door} \mid \text{door})" tip="Probability the sensor reports a door when the robot is beside one" value={params.sensor.hit} min={0.5} max={1} step={0.01} onChange={(v) => setParams((p) => ({ ...p, sensor: { ...p.sensor, hit: v } }))} />
        <Slider label="false alarm" tex="P(\text{door} \mid \text{wall})" tip="Probability the sensor reports a door beside a plain wall (= 1 − true-negative rate)" value={params.sensor.falseAlarm} min={0} max={0.6} step={0.01} onChange={(v) => setParams((p) => ({ ...p, sensor: { ...p.sensor, falseAlarm: v } }))} />
        <Rich className="note" text="New settings apply from the next step. Each sensor-table row sums to 1, so $P(\text{no door} \mid \text{door}) = 1 - \text{hit}$ and $P(\text{no door} \mid \text{wall}) = 1 - \text{false alarm}$." />
      </Panel>

      <Panel title="Corridor">
        <div className="bayes-row">
          <Select
            label="Corridor preset"
            value={presetId === 'custom' ? 'custom' : presetId}
            onChange={(v) => v !== 'custom' && loadPreset(v)}
            options={[...CORRIDOR_PRESETS.map((p) => ({ value: p.id, label: p.label })), ...(presetId === 'custom' ? [{ value: 'custom', label: 'Your corridor' }] : [])]}
          />
          <Segmented
            size="sm"
            label="Corridor ends"
            value={params.ends}
            onChange={(v: CorridorEnds) => setParams((p) => ({ ...p, ends: v }))}
            options={[
              { value: 'loop', label: 'Loop', title: 'The corridor is a ring: leaving on the right re-enters on the left' },
              { value: 'wall', label: 'Walls', title: 'The robot stops at the right-hand end' },
            ]}
          />
        </div>
        <Rich className="note" text={`${preset ? preset.note : 'Your corridor.'} Click a cell of the corridor to add or remove a door.`} />
      </Panel>

      <Panel title="Predict, then check" className="bayes-predicts">
        <PredictReveal
          id="bayes-grid1d-first-door"
          question="The belief is uniform over the corridor with three doors. The robot senses **a door**. What does the corrected belief look like?"
          options={['One tall peak at the robot’s true door', 'One peak at **every** door, all the same height', 'Still uniform: one reading is not enough', 'Peaks between the doors']}
          answer={1}
          explain="The likelihood is the same at every door ($P(\text{door} \mid \text{door})$ = 0.9) and the prior is flat, so every door cell gets the same posterior. The robot knows it is beside *a* door, not which one: the belief is **multimodal**, one peak per door ($0.9/4.05 \approx 0.22$ each, against $0.05/4.05 \approx 0.01$ at a wall). Only the pattern of later readings, combined with the known motion, can tell the doors apart."
          tryIt="start from a uniform belief and correct with “door”."
          onApply={() =>
            setup(() => {
              setParams(DEFAULT_PARAMS);
              paramsRef.current = DEFAULT_PARAMS;
              loadPreset('classic', 7);
              skipAnim.current = false;
              setShowRobot(true);
              setHist((h) => {
                const s0 = { ...h[h.length - 1], reading: 'door' as DoorReading };
                return [s0, doCorrect(s0, doorsRef.current, 'door', DEFAULT_PARAMS, rand)];
              });
            })
          }
        />
        <PredictReveal
          id="bayes-grid1d-blur"
          question="The robot is fairly sure where it is. It now moves right **eight times without sensing**. What happens to its belief?"
          options={['It keeps its shape and just shifts right', 'It spreads out a little more at every move (entropy rises)', 'It gets sharper, because the robot knows it moved']}
          answer={1}
          explain="Every prediction convolves the belief with the motion noise: each cell’s probability splits over stay / 1 / 2 cells. The spreads compound (variances add), so the peak shrinks and widens at every move and the entropy climbs toward the uniform $\log_2 30 \approx 4.9$ bits. Moving never adds information; only a measurement can bring the uncertainty back down. (With perfectly exact motion the belief would only shift.)"
          tryIt="localise the robot, then press Predict eight times and watch the entropy plot."
          onApply={() =>
            setup(() => {
              setShowRobot(true);
              const p = { ...DEFAULT_PARAMS, motion: { under: 0.15, exact: 0.7, over: 0.15 } };
              setParams(p);
              paramsRef.current = p;
              setHist((h) => {
                const s = h[h.length - 1];
                const bel = new Array<number>(doorsRef.current.length).fill(0);
                bel[s.robot] = 1;
                return [{ ...s, bel, step: null, t: 0 }];
              });
              skipAnim.current = true;
              runQueue(['p', 'p', 'p', 'p', 'p', 'p', 'p', 'p']);
            })
          }
        />
        <PredictReveal
          id="bayes-grid1d-useless"
          question="Set the false-alarm rate **equal** to the hit rate (both 0.6). What does a correction do to the belief?"
          options={['Sharpens it at the doors', 'Nothing: the posterior equals the prior', 'Flattens it to uniform']}
          answer={1}
          explain="If $P(z \mid \text{door}) = P(z \mid \text{wall})$, the likelihood is the same number at every cell. Multiplying by a constant and normalising changes nothing: $\eta$ exactly cancels it, so the posterior row below is a copy of the prior row. A reading that is equally likely in every state carries no information. What matters is the **ratio** of hit rate to false-alarm rate, not the hit rate alone."
          tryIt="set both sensor sliders to 0.6 and correct."
          onApply={() =>
            setup(() => {
              setHist((h) => {
                const s = h[h.length - 1];
                if (entropyBits(s.bel) < Math.log2(s.bel.length) - 0.05) return h;
                // From a flat belief "nothing changes" would be invisible: take one good "door" reading first
                // (shown at once), so the useless reading below has a belief with peaks to leave untouched.
                skipAnim.current = true;
                return [...h, doCorrect({ ...s, reading: 'door' }, doorsRef.current, 'door', { ...paramsRef.current, sensor: DEFAULT_PARAMS.sensor }, rand)];
              });
              const p = { ...paramsRef.current, sensor: { hit: 0.6, falseAlarm: 0.6 } };
              setParams(p);
              paramsRef.current = p;
              runQueue(['c']);
            })
          }
        />
        <PredictReveal
          id="bayes-grid1d-aliasing"
          question="Load the **evenly spaced** doors on the looped corridor and let the robot drive round for twelve predict–correct cycles. Does it localise?"
          options={['Yes: one sharp peak after a few doors', 'No: three equal peaks, 10 cells apart, survive forever', 'It localises, but to the wrong door']}
          answer={1}
          explain="Every door looks the same and so does every gap. Whatever sequence of readings the robot gets, shifting the whole story by 10 cells fits it equally well, so the three hypotheses keep identical weights: the readings cannot break the symmetry. This is **perceptual aliasing**; the fix is a distinctive landmark (an irregular door, a sign), not more of the same readings. Compare the three-door preset: there the uneven gaps let the pattern of readings pick one door, usually within one lap."
          tryIt="load “Evenly spaced doors” and press Auto-run."
          onApply={() =>
            setup(() => {
              setShowRobot(true);
              setParams(DEFAULT_PARAMS);
              paramsRef.current = DEFAULT_PARAMS;
              loadPreset('even', 5);
              setSpeed(4);
              runQueue(Array.from({ length: 24 }, (_, k) => (k % 2 ? 'c' : 'p')));
            })
          }
        />
      </Panel>
    </>
  );

  return (
    <BayesLayout
      left={left}
      right={right}
      below={
        <More label="The equations behind each step">
          <Rich
            text={`- **Predict** (actuation $u_t$ = move right): $\\overline{bel}(x_t) = \\sum_{x_{t-1}} p(x_t \\mid u_t, x_{t-1})\\, bel(x_{t-1})$. Each bar is split by the motion model and the pieces that land on the same cell add (a convolution). Uncertainty grows.
- **Correct** (measurement $z_t$): $bel(x_t) = \\eta\\, p(z_t \\mid x_t)\\, \\overline{bel}(x_t)$ with $\\eta = 1 / \\sum_x p(z_t \\mid x)\\overline{bel}(x) = 1/P(z_t)$. Uncertainty shrinks where the reading fits.
- Entropy $H = -\\sum_x bel(x)\\log_2 bel(x)$ measures the spread: 0 bits when certain, $\\log_2 30 \\approx 4.91$ bits when uniform over 30 cells.
- The robot’s own reading is sampled from the sensor model at its true cell. The highlighted button uses it; the other button forces the opposite reading (a sensor error), which you can also try.`}
          />
        </More>
      }
    />
  );
}

// ------------------------------------------------------------------ the last step, piece by piece

const BRK_T = 30;
const BRK_H = 150;
const ROW_H = 44;
const ROW_GAP = 22;
const rowTop = (r: number) => 26 + r * (ROW_H + ROW_GAP);
const BRK_PRED_H = BRK_T + BRK_H + 26;
const BRK_CORR_H = rowTop(4) - 4;

interface PieceGeo {
  k: number;
  from: number;
  to: number;
  travel: number;
  mass: number;
  yFrom: number;
  yTo: number;
}

interface BreakdownGeo {
  yMax: number;
  yPost: number;
  /** Scale of the product row: the prior's, unless the products are tiny (a surprising reading), then magnified. */
  yProd: number;
  pieces?: PieceGeo[];
}

function breakdownGeo(step: Snap['step'], n: number): BreakdownGeo {
  if (!step) return { yMax: 1, yPost: 1, yProd: 1 };
  if (step.kind === 'predict') {
    const yMax = niceMax(Math.max(...step.before, ...step.after));
    const pieces: PieceGeo[] = [];
    const destStack = new Array<number>(n).fill(0);
    for (let i = 0; i < n; i++) {
      let originStack = 0;
      step.shifts.forEach((s, k) => {
        const mass = step.layers[k][i];
        const to = step.dest[k][i];
        const travel = to >= i ? to - i : to + n - i;
        pieces.push({ k, from: i, to, travel, mass, yFrom: originStack, yTo: 0 });
        originStack += mass;
      });
    }
    // Stack at the destinations in outcome order (stays at the bottom, then 1 cell, then 2 cells).
    for (let k = 0; k < 3; k++)
      for (const p of pieces)
        if (p.k === k) {
          p.yTo = destStack[p.to];
          destStack[p.to] += p.mass;
        }
    return { yMax, yPost: 1, yProd: yMax, pieces };
  }
  const yMax = niceMax(Math.max(...step.before));
  const yPost = niceMax(Math.max(...step.after));
  const pMax = Math.max(...step.product);
  const yProd = pMax > 0 && pMax < 0.3 * yMax ? niceMax(pMax) : yMax;
  return { yMax, yPost, yProd };
}

function Breakdown({
  snap,
  geo: G,
  brk,
  pieceRefs,
  prodRefs,
  postRefs,
  etaRef,
}: {
  snap: Snap;
  geo: Geo;
  brk: BreakdownGeo;
  pieceRefs: { current: (SVGRectElement | null)[] };
  prodRefs: { current: (SVGRectElement | null)[] };
  postRefs: { current: (SVGRectElement | null)[] };
  etaRef: { current: SVGTextElement | null };
}) {
  const step = snap.step;
  const n = G.n;
  if (!step)
    return (
      <div className="bayes-breakdown is-empty">
        <Rich text="**Start:** the robot has no idea where it is, so the belief is uniform ($1/30$ per cell). Press **Predict** or one of the **Correct** buttons; this panel then shows the step piece by piece." />
      </div>
    );
  const H0 = entropyBits(step.before);
  const H1 = entropyBits(step.after);
  if (step.kind === 'predict') {
    const pieces = brk.pieces!;
    const probs = step.shifts.map((s) => s.p);
    return (
      <div className="bayes-breakdown">
        <Rich
          className="small"
          text={`**Predict.** Each bar splits into ${probs.map((p, k) => `${PIECE_NAME[k]} (${f2(p)})`).join(', ')}; the pieces slide right and pieces landing in the same cell **add**. Entropy ${f2(H0)} → **${f2(H1)} bits**${H1 > H0 + 0.005 ? ': the belief spread out.' : ': unchanged (exact motion only shifts it).'}${step.moved !== 1 ? ` (The real robot ${step.moved === 0 ? 'slipped and stayed put' : 'overshot by a cell'}.)` : ''}`}
        />
        <svg viewBox={`0 0 ${VW} ${BRK_PRED_H}`} width="100%" role="img" aria-label="Prediction: the old belief split into motion outcomes and shifted right">
          <text x={6} y={BRK_T - 10} className="bayes-axis-label">
            dashed: bel(x) before · stacked: the pieces after the move = new bel(x)
          </text>
          {[0, brk.yMax].map((v) => (
            <g key={v}>
              <line x1={PAD_L} x2={VW - PAD_R} y1={barY(v, brk.yMax, BRK_T, BRK_H)} y2={barY(v, brk.yMax, BRK_T, BRK_H)} className="bayes-gridline" />
              <text x={PAD_L - 5} y={barY(v, brk.yMax, BRK_T, BRK_H) + 4} textAnchor="end" className="bayes-tick">
                {fmtTick(v)}
              </text>
            </g>
          ))}
          <clipPath id="bayes-brk-clip">
            <rect x={PAD_L} y={0} width={VW - PAD_L - PAD_R} height={BRK_PRED_H} />
          </clipPath>
          <g clipPath="url(#bayes-brk-clip)">
            {pieces.map((p, j) => {
              const hh = barH(p.mass, brk.yMax, BRK_H);
              return (
                <rect
                  key={j}
                  ref={(el) => {
                    pieceRefs.current[j] = el;
                  }}
                  x={G.x(p.to) + 1.5}
                  y={BRK_T + BRK_H - barH(p.yTo, brk.yMax, BRK_H) - hh}
                  width={G.cw - 3}
                  height={hh}
                  fill={PIECE_COL[p.k]}
                />
              );
            })}
            {step.before.map((v, i) => (
              <rect key={`o${i}`} x={G.x(i) + 1.5} width={G.cw - 3} y={barY(v, brk.yMax, BRK_T, BRK_H)} height={barH(v, brk.yMax, BRK_H)} fill="none" stroke="var(--text-2)" strokeWidth={1} strokeDasharray="3 2" />
            ))}
          </g>
          {Array.from({ length: n }, (_, i) =>
            i === 0 || (i + 1) % 5 === 0 ? (
              <text key={`x${i}`} x={G.x(i) + G.cw / 2} y={BRK_T + BRK_H + 15} textAnchor="middle" className="bayes-tick">
                {i + 1}
              </text>
            ) : null
          )}
        </svg>
        <div className="bayes-legend-line small">
          {PIECE_NAME.map((nm, k) => (
            <span key={k}>
              <span className="bayes-dot" style={{ background: PIECE_COL[k] }} /> {nm} ({f2(probs[k])})
            </span>
          ))}
          <span>
            <span className="bayes-dot is-outline" /> before
          </span>
        </div>
      </div>
    );
  }
  const z = step.z;
  const ev = step.evidence;
  const { likDoor, likWall } = step;
  const rows: { label: string; vals: number[]; yMax: number; col: string; refs?: { current: (SVGRectElement | null)[] }; initial?: 'zero' }[] = [
    { label: 'prior: predicted belief b̅e̅l̅(x)', vals: step.before, yMax: brk.yMax, col: 'var(--m1)' },
    { label: `× likelihood P(z = ${z === 'door' ? 'door' : 'no door'} | x)   (scale 0 to 1)`, vals: step.lik, yMax: 1, col: 'var(--m2)' },
    {
      label:
        brk.yProd < brk.yMax
          ? `= product, sums to P(z) = ${f3(ev)}: drawn ×${Number((brk.yMax / brk.yProd).toFixed(1))} larger so it stays visible`
          : `= product (same scale as the prior): sums to P(z) = ${f3(ev)}`,
      vals: step.product,
      yMax: brk.yProd,
      col: 'var(--m3)',
      refs: prodRefs,
    },
    { label: 'posterior bel(x) = η × product', vals: step.after, yMax: brk.yPost, col: 'var(--m1)', refs: postRefs },
  ];
  return (
    <div className="bayes-breakdown">
      <Rich
        className="small"
        text={`**Correct** with $z$ = ${z === 'door' ? 'door' : 'no door'}${step.fromRobot ? '' : ' (forced: the robot’s sensor said otherwise)'}. Likelihood ${f2(likDoor)} at a door, ${f2(likWall)} at a wall; the products sum to $P(z)$ = ${f3(ev)}, so $\\eta$ = ${ev > 0 ? f2(1 / ev) : '—'}. Entropy ${f2(H0)} → **${f2(H1)} bits**.`}
      />
      <svg viewBox={`0 0 ${VW} ${BRK_CORR_H}`} width="100%" role="img" aria-label="Correction: prior times likelihood gives the product; dividing by its sum gives the posterior">
        {rows.map((r, ri) => {
          const t = rowTop(ri);
          return (
            <g key={ri}>
              <text x={PAD_L} y={t - 6} className="bayes-axis-label">
                {r.label}
              </text>
              <line x1={PAD_L} x2={VW - PAD_R} y1={t + ROW_H} y2={t + ROW_H} className="bayes-gridline" />
              <text x={PAD_L - 5} y={t + 8} textAnchor="end" className="bayes-tick">
                {fmtTick(r.yMax)}
              </text>
              {r.vals.map((v, i) => (
                <rect
                  key={i}
                  ref={
                    r.refs
                      ? (el) => {
                          r.refs!.current[i] = el;
                        }
                      : undefined
                  }
                  x={G.x(i) + 1.5}
                  width={G.cw - 3}
                  y={barY(v, r.yMax, t, ROW_H)}
                  height={barH(v, r.yMax, ROW_H)}
                  fill={r.col}
                  rx={1}
                >
                  <title>{`Cell ${i + 1}: ${v.toFixed(4)}`}</title>
                </rect>
              ))}
            </g>
          );
        })}
        <text ref={etaRef} x={VW - PAD_R} y={rowTop(3) - 6} textAnchor="end" className="bayes-axis-label bayes-eta">
          {`÷ P(z): η = 1/${f3(ev)} = ${ev > 0 ? f2(1 / ev) : '—'}`}
        </text>
      </svg>
    </div>
  );
}

export const _test = { breakdownGeo, niceMax };
