// Gridworld lab: Q-learning (model-free, learns from sampled transitions) next to value iteration (model-based,
// sweeps Bellman backups with the known T). A robot runs ε-greedy episodes with stochastic slips; every transition
// is shown as the Q-learning update with this step's numbers, the Q table is a heat map of four triangles per cell,
// arrows show the greedy policy and dashed ghost arrows value iteration's optimal one.
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { ExploreItem } from '../../../engine/types';
import {
  ACTION_ARROWS,
  FREE,
  TERMINAL,
  bellmanBackup,
  epsGreedyProbs,
  gridMDP,
  gridPreset,
  newAgent,
  qAgentStep,
  qTableFromV,
  valueIteration,
  withDynamics,
  type GridPresetId,
  type GridWorld,
  type QAgent,
  type QStep,
  type TabularMDP,
} from '../../../core/rl';
import { mulberry32 } from '../../../engine/rng';
import { Button, Callout, More, Readout, Readouts, Segmented, Slider, Toggle } from '../../../ui/kit';
import { StepControls, useStepper } from '../../../ui/stepper';
import { PredictReveal } from '../../../ui/PredictReveal';
import { Rich, TeX } from '../../../ui/Rich';
import { HLine, Line, Plot } from '../../../plot/Plot';
import { useRaf } from '../../../anim/hooks';
import { completeChallenge, useProgress } from '../../../app/store';
import { C, GridView, arrowPath, cellX, cellY, qArrows, type NumMode } from './gridView';
import { Panel, cellName, n, np, revealLeft, t } from './rlCommon';

export const meta: Omit<ExploreItem, 'component'> = {
  id: 'gridworld',
  title: 'Gridworld: Q-learning vs value iteration',
  summary:
    'A robot learns a gridworld by trial and error: ε-greedy moves, random slips, and the update $Q(s,a) \\leftarrow Q(s,a) + \\alpha[r + \\gamma \\max_{a\'} Q(s\',a\') - Q(s,a)]$ shown with every step’s numbers. Switch to value iteration, which knows $T$, to see the same answer computed without a single move.',
  notice:
    'Watch value flow backwards from the +1 one update at a time, how $\\gamma$ decides between a near and a far reward, how slips push the best route away from the pits, and how little Q-learning knows about places it never tries.',
  challenge: { id: 'rl-grid-flip', title: 'Find the discount factor at which S’s best exit flips on the two-exit map (±0.01)' },
  minutes: 12,
};

const CHALLENGE_ID = 'rl-grid-flip';
const MAX_STEPS = 100;
const MAX_HIST = 4000;

type Mode = 'q' | 'vi';
const MAPS: { id: GridPresetId; label: string; note: string }[] = [
  { id: 'classic', label: '4 × 3 world', note: 'Russell and Norvig’s world: +1 goal, −1 pit, one wall, a step reward of −0.04 and a 20 % slip (10 % to each side).' },
  { id: 'cliff', label: 'Cliff edge', note: 'Start and goal at the bottom with −1 pits between them. A slip sideways off the edge row is fatal.' },
  { id: 'tworeward', label: 'Two exits', note: 'A near exit worth +0.5 (2 moves from S) and a far one worth +1 (6 moves). No step cost, no slip: only $\\gamma$ decides.' },
];
const SPEEDS = [2, 5, 20, 100, 1000];
/** KaTeX-safe arrows for N, E, S, W. */
const ACT_TEX = ['\\uparrow', '\\rightarrow', '\\downarrow', '\\leftarrow'];

interface Run {
  ag: QAgent;
  rand: () => number;
  hist: number[];
  /** Episode number of hist[0]. */
  histStart: number;
  steps: number;
  last: QStep | null;
  seed: number;
}

function newRun(g: GridWorld, seed: number): Run {
  return { ag: newAgent(g), rand: mulberry32(seed), hist: [], histStart: 0, steps: 0, last: null, seed };
}

function pushHist(run: Run, G: number) {
  run.hist.push(G);
  if (run.hist.length > MAX_HIST) {
    run.hist.splice(0, run.hist.length - MAX_HIST);
    run.histStart = run.ag.episode - run.hist.length;
  }
}

function stepRun(run: Run, g: GridWorld, p: { alpha: number; gamma: number; eps: number }): QStep {
  const st = qAgentStep(g, run.ag, { ...p, maxSteps: MAX_STEPS }, run.rand);
  run.steps++;
  run.last = st;
  if (st.episodeEnd) pushHist(run, st.G ?? 0);
  return st;
}

function fastForward(run: Run, g: GridWorld, p: { alpha: number; gamma: number; eps: number }, episodes: number) {
  const target = run.ag.episode + episodes;
  let guard = episodes * (MAX_STEPS + 2);
  while (run.ag.episode < target && guard-- > 0) stepRun(run, g, p);
}

/** Cells where the learnt greedy action is optimal (within 0.01 of V*). */
function agreement(g: GridWorld, Q: ArrayLike<number>, Qstar: ArrayLike<number>, Vstar: ArrayLike<number>): { ok: number; total: number; visited: number } {
  let ok = 0;
  let total = 0;
  let visited = 0;
  for (let s = 0; s < g.cols * g.rows; s++) {
    if (g.kind[s] !== FREE) continue;
    total++;
    let best = 0;
    let any = false;
    for (let a = 0; a < 4; a++) {
      if (Q[s * 4 + a] > Q[s * 4 + best]) best = a;
      if (Q[s * 4 + a] !== 0) any = true;
    }
    if (any) visited++;
    if (any && Qstar[s * 4 + best] >= Vstar[s] - 0.01) ok++;
  }
  return { ok, total, visited };
}

export default function GridWorldSim() {
  const challengeDone = !!useProgress().challenges?.[CHALLENGE_ID];
  const [mapId, setMapId] = useState<GridPresetId>('classic');
  const [slip, setSlip] = useState(0.2);
  const [stepCost, setStepCost] = useState(-0.04);
  const [gamma, setGamma] = useState(0.9);
  const [alpha, setAlpha] = useState(0.3);
  const [eps, setEps] = useState(0.2);
  const [mode, setMode] = useState<Mode>('q');
  const [nums, setNums] = useState<NumMode>('q');
  const [ghost, setGhost] = useState(false);
  const [sel, setSel] = useState<number>(-1);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(5);
  const [, setVersion] = useState(0);
  const bump = () => setVersion((v) => v + 1);
  const leftRef = useRef<HTMLDivElement>(null);
  const agentRef = useRef<SVGGElement>(null);
  const anim = useRef({ from: -1, to: -1, t0: 0, dur: 0 });
  const endRef = useRef({ i: 0, n: 0, pin: false });

  const g = useMemo(() => withDynamics(gridPreset(mapId), { slip, stepCost }), [mapId, slip, stepCost]);
  const mdp: TabularMDP = useMemo(() => gridMDP(g), [g]);
  const vi = useMemo(() => valueIteration(mdp, gamma, { tol: 1e-6, maxSweeps: 400 }), [mdp, gamma]);
  const runRef = useRef<Run>(newRun(g, 1));
  const run = runRef.current;
  if (run.ag.Q.length !== g.cols * g.rows * 4) runRef.current = newRun(g, run.seed + 1);

  // Value iteration is stepped one sweep at a time.
  const st = useStepper(vi.sweeps, { speed: 4 });
  const viK = Math.min(st.i, vi.history.length - 1);

  const params = { alpha, gamma, eps };
  const animate = (s: QStep) => {
    const slow = speed <= 5 && !document.hidden;
    anim.current = { from: s.s, to: s.s2, t0: performance.now(), dur: slow ? Math.min(450, 750 / speed) : 0 };
  };

  // ---------------------------------------------------------------- Q-learning play loop
  const acc = useRef(0);
  useRaf(
    (dt) => {
      if (playing) {
        acc.current += dt * speed;
        let k = Math.floor(acc.current);
        if (k > 0) {
          acc.current -= k;
          k = Math.min(k, 400);
          let last: QStep | null = null;
          for (let j = 0; j < k; j++) last = stepRun(runRef.current, g, params);
          if (last) animate(last);
          bump();
        }
      }
      const moving = anim.current.dur > 0;
      placeAgent();
      // A manual step's slide just finished: re-render once so this loop switches itself off.
      if (!playing && moving && anim.current.dur === 0) bump();
    },
    playing || anim.current.dur > 0
  );

  const agentXY = (s: number) => [cellX(g, s) + C / 2, cellY(g, s) + C / 2];
  function placeAgent() {
    const el = agentRef.current;
    if (!el) return;
    const a = anim.current;
    const last = runRef.current.last;
    let x: number;
    let y: number;
    if (!last || a.from < 0) [x, y] = agentXY(runRef.current.ag.s);
    else {
      const u = a.dur > 0 ? Math.min(1, (performance.now() - a.t0) / a.dur) : 1;
      const [x0, y0] = agentXY(a.from);
      const [x1, y1] = agentXY(a.to);
      x = x0 + (x1 - x0) * u;
      y = y0 + (y1 - y0) * u;
      if (u >= 1) a.dur = 0;
    }
    const tr = `translate(${x.toFixed(1)} ${y.toFixed(1)})`;
    // Only touch the DOM when the robot actually moved (an unchanged attribute write still invalidates style).
    if (el.getAttribute('transform') !== tr) el.setAttribute('transform', tr);
  }
  useLayoutEffect(placeAgent);

  // ---------------------------------------------------------------- actions
  const resetQ = (seed = runRef.current.seed + 1, world = g) => {
    runRef.current = newRun(world, seed);
    anim.current = { from: -1, to: -1, t0: 0, dur: 0 };
    acc.current = 0;
    bump();
  };
  const stepOnce = () => {
    setPlaying(false);
    const s = stepRun(runRef.current, g, params);
    animate(s);
    if (sel < 0) setSel(s.s);
    bump();
  };
  const ff = (episodes: number) => {
    setPlaying(false);
    fastForward(runRef.current, g, params, episodes);
    anim.current = { from: -1, to: -1, t0: 0, dur: 0 };
    bump();
  };
  const loadMap = (id: GridPresetId) => {
    const p = gridPreset(id);
    setPlaying(false);
    setMapId(id);
    setSlip(p.slip);
    setStepCost(p.stepCost);
    setSel(-1);
    resetQ(runRef.current.seed + 1, p);
    st.reset();
  };
  const setup = (o: { map: GridPresetId; gamma?: number; eps?: number; alpha?: number; slip?: number; mode: Mode; episodes?: number; seed?: number; nums?: NumMode; ghost?: boolean }) => {
    const p = gridPreset(o.map);
    const world = withDynamics(p, { slip: o.slip ?? p.slip });
    setPlaying(false);
    setMapId(o.map);
    setSlip(world.slip);
    setStepCost(world.stepCost);
    if (o.gamma !== undefined) setGamma(o.gamma);
    if (o.eps !== undefined) setEps(o.eps);
    if (o.alpha !== undefined) setAlpha(o.alpha);
    setMode(o.mode);
    if (o.nums) setNums(o.nums);
    if (o.ghost !== undefined) setGhost(o.ghost);
    setSel(world.start);
    const r = newRun(world, o.seed ?? 2024);
    if (o.episodes) fastForward(r, world, { alpha: o.alpha ?? alpha, gamma: o.gamma ?? gamma, eps: o.eps ?? eps }, o.episodes);
    runRef.current = r;
    anim.current = { from: -1, to: -1, t0: 0, dur: 0 };
    if (o.mode === 'vi') {
      endRef.current.pin = true;
      st.setI(10_000);
    }
    bump();
    revealLeft(leftRef.current);
  };

  // Value iteration: if the student was at the last sweep (or a prediction asked for convergence), stay at the
  // last sweep when γ, the slip or the map changes the number of sweeps.
  useEffect(() => {
    const e = endRef.current;
    if (e.pin || (e.n > 0 && e.i >= e.n)) st.setI(vi.sweeps);
    e.pin = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vi]);
  useEffect(() => {
    endRef.current.i = st.i;
    endRef.current.n = st.n;
  });

  // ---------------------------------------------------------------- derived views
  const R = runRef.current;
  const last = R.last;
  const Vk = vi.history[viK];
  const Qk = useMemo(() => qTableFromV(mdp, Vk, gamma), [mdp, Vk, gamma]);
  const showQ = mode === 'q' ? R.ag.Q : Qk;
  const arrows = qArrows(g, showQ);
  const optimalArrows = useMemo(() => {
    const a = new Int8Array(g.cols * g.rows).fill(-1);
    for (let s = 0; s < a.length; s++) if (g.kind[s] === FREE) a[s] = vi.policy[s];
    return a;
  }, [g, vi]);
  const Vq = useMemo(() => {
    const v = new Float64Array(g.cols * g.rows);
    for (let s = 0; s < v.length; s++) if (g.kind[s] === FREE) v[s] = Math.max(R.ag.Q[s * 4], R.ag.Q[s * 4 + 1], R.ag.Q[s * 4 + 2], R.ag.Q[s * 4 + 3]);
    return v;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [g, R, R.steps]);
  const agree = agreement(g, R.ag.Q, vi.Q, vi.V);
  const selCell = sel >= 0 && g.kind[sel] === FREE ? sel : g.start;

  // Challenge: S's choice flips at γ = 0.5^(1/4) ≈ 0.841 on the two-exit map.
  const flip = Math.pow(0.5, 1 / 4);
  const challengeMet = mapId === 'tworeward' && slip === 0 && stepCost === 0 && Math.abs(gamma - flip) <= 0.01;
  useEffect(() => {
    if (challengeMet && !challengeDone) completeChallenge(CHALLENGE_ID);
  }, [challengeMet, challengeDone]);

  // ---------------------------------------------------------------- overlay: agent, update highlights
  const over: ReactNode[] = [];
  if (mode === 'q') {
    if (last) {
      const x = cellX(g, last.s);
      const y = cellY(g, last.s);
      const cx = x + C / 2;
      const cy = y + C / 2;
      const triPts = [
        `${x},${y} ${x + C},${y} ${cx},${cy}`,
        `${x + C},${y} ${x + C},${y + C} ${cx},${cy}`,
        `${x + C},${y + C} ${x},${y + C} ${cx},${cy}`,
        `${x},${y + C} ${x},${y} ${cx},${cy}`,
      ][last.a];
      over.push(<polygon key="upd" points={triPts} className="rl-upd" />);
      if (!last.done) {
        const s2 = last.s2;
        const best = [0, 1, 2, 3].reduce((b, a) => (R.ag.Q[s2 * 4 + a] > R.ag.Q[s2 * 4 + b] ? a : b), 0);
        const x2 = cellX(g, s2);
        const y2 = cellY(g, s2);
        const c2x = x2 + C / 2;
        const c2y = y2 + C / 2;
        const t2 = [
          `${x2},${y2} ${x2 + C},${y2} ${c2x},${c2y}`,
          `${x2 + C},${y2} ${x2 + C},${y2 + C} ${c2x},${c2y}`,
          `${x2 + C},${y2 + C} ${x2},${y2 + C} ${c2x},${c2y}`,
          `${x2},${y2 + C} ${x2},${y2} ${c2x},${c2y}`,
        ][best];
        over.push(<polygon key="next" points={t2} className="rl-next" />);
      } else over.push(<rect key="next" x={cellX(g, last.s2) + 3} y={cellY(g, last.s2) + 3} width={C - 6} height={C - 6} className="rl-next" />);
      if (last.slipped) {
        const p = arrowPath(x, y, last.intended, 64, 12);
        over.push(<path key="intent" d={p.shaft + p.head} className="rl-intent" />);
      }
    }
    over.push(
      <g key="agent" ref={agentRef} className="rl-agent" pointerEvents="none">
        <circle r={11} />
        <circle r={4} className="rl-agent-eye" />
      </g>
    );
  }

  const mapNote = MAPS.find((m) => m.id === mapId)!.note;

  // ---------------------------------------------------------------- left column
  const left = (
    <div className="rl-left rl-panel" ref={leftRef}>
      <div className="rl-bar">
        <Segmented
          label="Method"
          value={mode}
          onChange={(m) => {
            setPlaying(false);
            setMode(m);
          }}
          options={[
            { value: 'q', label: 'Q-learning (model-free)', title: 'Learns Q from sampled transitions; never sees T' },
            { value: 'vi', label: 'Value iteration (model-based)', title: 'Sweeps Bellman backups using the known T and R' },
          ]}
        />
      </div>
      <div className="rl-bar">
        <Segmented size="sm" label="Map" value={mapId} onChange={loadMap} options={MAPS.map((m) => ({ value: m.id, label: m.label }))} />
      </div>
      <GridView
        g={g}
        Q={mode === 'q' ? R.ag.Q : Qk}
        V={mode === 'q' ? Vq : Vk}
        heat={nums === 'v' ? 'v' : 'q'}
        nums={nums}
        arrows={arrows}
        ghosts={mode === 'q' && ghost ? optimalArrows : null}
        selected={selCell}
        onPick={setSel}
        over={over}
        ariaLabel={`Gridworld ${g.name}, ${g.cols} by ${g.rows}. ${mode === 'q' ? `Q-learning after ${R.ag.episode} episodes.` : `Value iteration after ${viK} sweeps.`}`}
      />
      {mode === 'q' ? (
        <div className="rl-bar rl-controls">
          <Button size="sm" variant="primary" onClick={() => setPlaying((p) => !p)} aria-label={playing ? 'Pause' : 'Play episodes'}>
            {playing ? '⏸ Pause' : '▶ Play'}
          </Button>
          <Button size="sm" onClick={stepOnce} title="One transition: choose, move, observe r and s′, update Q(s,a)">
            ▶| One step
          </Button>
          <Button size="sm" onClick={() => ff(100)} title="Run 100 whole episodes at once">
            ⏩ +100 episodes
          </Button>
          <Button size="sm" variant="ghost" onClick={() => resetQ()} title="Q = 0 everywhere, episode count 0">
            ↺ Reset Q
          </Button>
          <Segmented size="sm" label="Steps per second" value={speed} onChange={setSpeed} options={SPEEDS.map((s) => ({ value: s, label: s >= 1000 ? 'max' : `${s}/s` }))} />
        </div>
      ) : (
        <StepControls st={st} label="sweep" speeds={[1, 2, 4, 10]} />
      )}
      <div className="rl-legend small">
        <span>
          <i className="rl-sw rl-sw-pos" /> positive value
        </span>
        <span>
          <i className="rl-sw rl-sw-neg" /> negative
        </span>
        <span>
          <b className="rl-sw-arrow">→</b> greedy action
        </span>
        {mode === 'q' && (
          <>
            <span>
              <i className="rl-sw rl-sw-upd" /> Q(s,a) just updated
            </span>
            <span>
              <i className="rl-sw rl-sw-next" /> max Q(s′,·) used
            </span>
            <span>
              <i className="rl-sw rl-sw-intent" /> intended move (slipped)
            </span>
            {ghost && (
              <span>
                <i className="rl-sw rl-sw-ghost" /> optimal (value iteration)
              </span>
            )}
          </>
        )}
      </div>
      <Rich className="note" text={mapNote} />
    </div>
  );

  // ---------------------------------------------------------------- right column
  const recent = R.hist.slice(-50);
  const meanRecent = recent.length ? recent.reduce((s, x) => s + x, 0) / recent.length : NaN;
  const right = (
    <div className="rl-right">
      <Panel title="Settings">
        <Slider label="discount" tex="\gamma" tip="Weight of a reward one step later. Small: short-sighted. Near 1: far-sighted." value={gamma} min={0} max={0.99} step={0.01} onChange={setGamma} sig={2} />
        <Slider label="learning rate" tex="\alpha" tip="How far each update moves Q(s,a) towards the TD target (Q-learning only)." value={alpha} min={0.01} max={1} step={0.01} onChange={setAlpha} sig={2} disabled={mode === 'vi'} />
        <Slider label="exploration" tex="\varepsilon" tip="Probability of a random action instead of the greedy one (Q-learning only)." value={eps} min={0} max={1} step={0.01} onChange={setEps} sig={2} disabled={mode === 'vi'} />
        <Slider label="slip probability" tip="Chance a move goes 90° off course (half to each side). This is what makes T stochastic." value={slip} min={0} max={0.5} step={0.01} onChange={setSlip} sig={2} />
        <Slider label="step reward" tip="Reward for every move that does not end in a terminal cell (a cost when negative)." value={stepCost} min={-0.2} max={0} step={0.01} onChange={setStepCost} sig={2} />
        <div className="rl-bar">
          <span className="rl-label">Numbers</span>
          <Segmented
            size="sm"
            label="Numbers on the map"
            value={nums}
            onChange={setNums}
            options={[
              { value: 'q', label: 'Q (4 per cell)', title: mode === 'q' ? 'One learnt Q value per action, in its triangle' : 'Q(s,a) = Σ T [r + γ V_k(s′)] from the current V_k, one per action' },
              { value: 'v', label: mode === 'q' ? 'V = max Q' : 'V_k', title: mode === 'q' ? 'V(s) = max over a of Q(s,a)' : 'The value after the current sweep' },
              { value: 'off', label: 'off' },
            ]}
          />
        </div>
        {mode === 'q' && <Toggle checked={ghost} onChange={setGhost} label="Show value iteration’s optimal policy (dashed)" />}
      </Panel>

      {mode === 'q' ? (
        <>
          <Panel title="Learning so far">
            <Readouts min={120}>
              <Readout label="Episodes" text={String(R.ag.episode)} tip="Finished episodes (reached a terminal cell or the 100-step limit)" />
              <Readout label="Transitions" text={String(R.steps)} tip="Q-learning updates made so far" />
              <Readout tex="G_0" label="last" value={R.hist.length ? R.hist[R.hist.length - 1] : undefined} sig={3} tip="Discounted return of the last episode, from S" />
              <Readout tex="\bar G_0" label="last 50" value={Number.isFinite(meanRecent) ? meanRecent : undefined} sig={3} tip="Mean discounted return over the last 50 episodes" tone="m1" />
              <Readout tex="V^*(S)" value={vi.V[g.start]} sig={3} tip="Best expected return from S (value iteration, which knows T)" tone="m3" />
              <Readout label="Optimal moves" text={`${agree.ok} / ${agree.total}`} tip="Cells whose learnt greedy action is optimal (within 0.01 of V*). Cells never visited do not count." tone={agree.ok === agree.total ? 'ok' : undefined} />
            </Readouts>
            <ReturnPlot hist={R.hist} start={R.histStart} vstar={vi.V[g.start]} version={R.ag.episode} />
          </Panel>
          <Panel title={last ? `This update (episode ${last.episode + 1}, step ${last.t})` : 'This update'} className="rl-update">
            <UpdateText g={g} last={last} alpha={alpha} gamma={gamma} eps={eps} slip={g.slip} />
          </Panel>
        </>
      ) : (
        <Panel title={viK === 0 ? 'Value iteration: start' : `Sweep ${viK} of ${vi.sweeps}${vi.converged && viK === vi.sweeps ? ' (converged)' : ''}`} className="rl-update">
          <ViText g={g} mdp={mdp} vi={vi} k={viK} s={selCell} gamma={gamma} />
        </Panel>
      )}

      <Panel title={`Inspect ${cellName(g, selCell)}`}>
        <Inspect g={g} s={selCell} mode={mode} Q={mode === 'q' ? R.ag.Q : Qk} vi={vi} eps={eps} />
        <p className="small muted">Click any free cell on the map to inspect it.</p>
      </Panel>

      <Panel title="Predict, then check" className="rl-predicts">
        <PredictReveal
          id="rl-grid-gamma"
          question="Two exits: **+0.5** two moves from S and **+1** six moves from S, no step cost, no slip. With $\gamma = 0.5$, which exit does the optimal policy from S head for?"
          options={['The near +0.5', 'The far +1', 'Either: they are worth the same']}
          answer={0}
          explain="Discounting: a reward $k$ steps ahead is multiplied by $\gamma^{k-1}$ in $G_0 = r_1 + \gamma r_2 + \dots$ The near exit is reached on move 2: worth $0.5\gamma = 0.25$. The far one on move 6: worth $\gamma^5 = 0.031$. A small $\gamma$ makes the robot short-sighted. The choice flips where $\gamma^5 = 0.5\gamma$, i.e. $\gamma = 0.5^{1/4} \approx 0.84$: drag $\gamma$ past it and watch the arrows near S swing round (that is the challenge)."
          tryIt="load the two-exit map, switch to value iteration and set γ = 0.5."
          onApply={() => setup({ map: 'tworeward', gamma: 0.5, mode: 'vi', nums: 'v' })}
        />
        <PredictReveal
          id="rl-grid-slip"
          question="Cliff edge, 20 % slip (10 % to each side), $\gamma = 0.9$, step reward −0.04. Which route does the optimal policy take from S?"
          options={['Along the edge row, just above the pits (7 moves)', 'One row higher (9 moves)', 'Along the top row (11 moves)']}
          answer={1}
          explain="On the edge row every move east has a 10 % chance of slipping south into a −1 pit, and that risk is repeated on four cells. One row higher, a slip only drops the robot onto the edge row, which is safe, so two extra moves (about $2 \times 0.04$ plus a little discounting) buy almost all the risk away. The top row adds two more moves for no extra safety. With slip 0 the edge route wins: T, not just R, shapes the optimal policy."
          tryIt="load the cliff, switch to value iteration and run it to convergence; then set the slip to 0."
          onApply={() => setup({ map: 'cliff', gamma: 0.9, slip: 0.2, mode: 'vi', nums: 'v' })}
        />
        <PredictReveal
          id="rl-grid-explore"
          question="Two exits again, now $\gamma = 0.95$, so the far +1 is the better exit. Q-learning with $\varepsilon = 0.1$ runs 300 episodes from S. Where does its greedy policy end up heading?"
          options={['The far +1 (the optimal exit)', 'The near +0.5', 'Nowhere: it never reaches an exit']}
          answer={1}
          explain="Q-learning only learns about what it tries. It stumbles on the near exit first, and exploring only 10 % of the time it almost never wanders six moves the other way, so Q for the far route stays 0 and the greedy policy keeps exploiting +0.5 (compare $V^*(S)$ with the returns it gets). Value iteration knows T and finds the far exit at once. Now set $\varepsilon = 0.8$ and press +100 episodes a few times: with enough exploration the far route takes over. Q-learning learns the optimal Q even while acting randomly, because its target uses $\max_{a'}$, not the action it actually takes next (it is *off-policy*)."
          tryIt="load the two-exit map, set γ = 0.95, ε = 0.1, reset Q and add 300 episodes. Turn on the dashed optimal policy."
          onApply={() => setup({ map: 'tworeward', gamma: 0.95, eps: 0.1, alpha: 0.5, mode: 'q', episodes: 300, nums: 'v', ghost: true })}
        />
      </Panel>

      <Panel title="Challenge: where does the choice flip?">
        <Rich
          className="small"
          text={`On the two-exit map (no slip, no step cost), find the $\\gamma$ at which S’s best exit changes from near to far, to within ±0.01. ${mapId === 'tworeward' ? `Now: $\\gamma = ${gamma.toFixed(2)}$, S heads for the **${optimalArrows[g.start] === 3 || optimalArrows[g.start] === 2 ? 'near +0.5' : 'far +1'}**.` : 'Load the two-exit map first.'}`}
        />
        {(challengeDone || challengeMet) && (
          <Callout kind="ok" title="Challenge complete">
            <Rich text="$0.5\gamma = \gamma^5 \Rightarrow \gamma = 0.5^{1/4} \approx 0.841$. Below it the near +0.5 wins; above it the far +1 is worth the wait. Exam questions on $\gamma$ test exactly this: small $\gamma$, short-sighted; $\gamma \to 1$, far-sighted." />
          </Callout>
        )}
      </Panel>
    </div>
  );

  return (
    <div className="rl-sim">
      <div className="rl-layout">
        {left}
        {right}
      </div>
      <More label="Conventions used here">
        <Rich
          text={`- Actions N, E, S, W. With slip $p$ the move goes as intended with probability $1-p$ and $90°$ to either side with $p/2$ each; a move into a wall or the edge leaves the robot where it is.
- Reward $r$ arrives on each transition: the terminal's value on entering a terminal (the episode then ends), otherwise the step reward. Terminal cells have no actions, so $\\max_{a'} Q(s',a') = 0$ there.
- The return is $G_0 = \\sum_k \\gamma^k r_{k+1}$ from S. Episodes are cut off after ${MAX_STEPS} moves.
- ε-greedy: with probability $\\varepsilon$ a uniformly random action (any of the four), otherwise a greedy one (ties broken at random).
- Value iteration sweeps synchronously: every $V_{k+1}(s) = \\max_a \\sum_{s'} T(s,a,s')[r + \\gamma V_k(s')]$ uses the old $V_k$. It stops when no value changes by more than $10^{-6}$.`}
        />
      </More>
    </div>
  );
}

// ------------------------------------------------------------------ pieces

function ReturnPlot({ hist, start, vstar }: { hist: number[]; start: number; vstar: number; version: number }) {
  const data = useMemo(() => {
    const nH = hist.length;
    if (!nH) return null;
    const bins = Math.min(240, nH);
    const raw: [number, number][] = [];
    const avg: [number, number][] = [];
    const W = Math.max(5, Math.min(50, Math.round(nH / 10)));
    let run = 0;
    const ma: number[] = [];
    for (let i = 0; i < nH; i++) {
      run += hist[i];
      if (i >= W) run -= hist[i - W];
      ma.push(run / Math.min(i + 1, W));
    }
    for (let b = 0; b < bins; b++) {
      const i0 = Math.floor((b * nH) / bins);
      const i1 = Math.max(i0 + 1, Math.floor(((b + 1) * nH) / bins));
      let s = 0;
      for (let i = i0; i < i1; i++) s += hist[i];
      raw.push([start + (i0 + i1) / 2, s / (i1 - i0)]);
      avg.push([start + i1, ma[i1 - 1]]);
    }
    let lo = Math.min(...raw.map((p) => p[1]), vstar, 0);
    let hi = Math.max(...raw.map((p) => p[1]), vstar, 0);
    if (hi - lo < 0.2) hi = lo + 0.2;
    lo = Math.floor(lo * 10) / 10;
    hi = Math.ceil(hi * 10) / 10;
    return { raw, avg, lo, hi, W, x0: start, x1: start + Math.max(nH, 10) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hist, hist.length, start, vstar]);
  if (!data) return <p className="small muted">The return of each episode will appear here. Press ▶ Play or +100 episodes.</p>;
  return (
    <>
      <Plot x={{ min: data.x0, max: data.x1, label: 'episode' }} y={{ min: data.lo, max: data.hi, label: 'G₀' }} height={170} ariaLabel="Discounted return of each episode, with its moving average and V* of S">
        <Line points={data.raw} color="var(--text-3)" width={1} />
        <Line points={data.avg} color="var(--m1)" width={2.4} />
        <HLine y={vstar} color="var(--m3)" label="V*(S)" />
      </Plot>
      <Rich
        className="small muted"
        text={`Grey: each episode’s $G_0$ (binned); blue: mean of the last ${data.W}. Green: the best possible expected return $V^*(S)$. With $\\varepsilon > 0$ the robot keeps exploring, so its average stays a little below it.`}
      />
    </>
  );
}

function UpdateText({ g, last, alpha, gamma, eps, slip }: { g: GridWorld; last: QStep | null; alpha: number; gamma: number; eps: number; slip: number }) {
  if (!last)
    return (
      <Rich
        className="small"
        text="Q starts at 0 everywhere. Press **▶| One step**: the robot picks an action ε-greedily, moves (perhaps slipping), observes the reward $r$ and the next state $s'$, and updates one entry: $$Q(s,a) \leftarrow Q(s,a) + \alpha\big[\underbrace{r + \gamma \max_{a'} Q(s',a')}_{\text{TD target}} - Q(s,a)\big]$$"
      />
    );
  const s = cellName(g, last.s);
  const s2 = cellName(g, last.s2);
  const how = last.explored
    ? `explored: a random action (probability $\\varepsilon = ${n(eps, 2)}$ of exploring)`
    : 'greedy: the best-looking action for this $Q$';
  const slipTxt = last.slipped
    ? `but **slipped** ${ACTION_ARROWS[last.moved]} instead (probability $${n(slip / 2, 2)}$)`
    : slip > 0
      ? `and moved as intended (probability $${n(1 - slip, 2)}$)`
      : 'and moved as intended';
  const where = last.s2 === last.s && !last.done ? ' (blocked: it stayed put)' : '';
  const rTxt = last.done ? `$r = ${n(last.r, 2)}$ for entering the ${last.r > 0 ? 'goal' : 'pit'}; the episode ends` : `$r = ${n(last.r, 2)}$ (step reward)`;
  const future = last.done ? `s' = \\text{${s2}} \\text{ is terminal: } \\max_{a'} Q(s',a') = 0` : `\\max_{a'} Q(\\text{${s2}},a') = ${n(last.maxNext)}`;
  const tex = `\\begin{aligned} Q(\\text{${s}},${ACT_TEX[last.a]}) &\\leftarrow Q(s,a) + \\alpha\\,[\\,r + \\gamma \\max_{a'} Q(s',a') - Q(s,a)\\,] \\\\ &= ${n(last.qOld)} + ${n(alpha, 2)}\\,[\\,${n(last.r, 2)} + ${n(gamma, 2)} \\times ${np(last.maxNext)} - ${np(last.qOld)}\\,] \\\\ &= ${n(last.qOld)} + ${n(alpha, 2)} \\times ${np(last.td)} = \\mathbf{${n(last.qNew)}} \\end{aligned}`;
  return (
    <div className="small">
      <Rich text={`In **${s}** the robot chose ${ACTION_ARROWS[last.intended]} (${how}) ${slipTxt}, landed in **${s2}**${where} and got ${rTxt}.`} />
      <div className="rl-tex">
        <TeX display>{future}</TeX>
        <TeX display>{tex}</TeX>
      </div>
      <Rich
        text={`TD target $r + \\gamma \\max_{a'} Q(s',a') = ${n(last.target)}$; TD error $= ${n(last.td)}$. Q moved ${n(Math.abs(alpha * last.td))} ${last.td >= 0 ? 'up' : 'down'}: a fraction $\\alpha$ of the way to the target. No $T$ appears anywhere: Q-learning only uses the sample $(s, a, r, s')$.`}
      />
    </div>
  );
}

function ViText({ g, mdp, vi, k, s, gamma }: { g: GridWorld; mdp: TabularMDP; vi: ReturnType<typeof valueIteration>; k: number; s: number; gamma: number }) {
  if (k === 0)
    return (
      <Rich
        className="small"
        text={`$V_0 = 0$ everywhere. Each sweep replaces every value at once with a Bellman backup that **uses the model** $T$: $$V_{k+1}(s) = \\max_a \\sum_{s'} T(s,a,s')\\,[\\,r + \\gamma V_k(s')\\,]$$ No robot moves and nothing is sampled. Press ▶| for sweep 1 and watch value spread one cell per sweep from the terminals. Click a cell to see its backup.`}
      />
    );
  const prev = vi.history[k - 1];
  const b = bellmanBackup(mdp, prev, s, gamma);
  const rows = [0, 1, 2, 3].map((a) => {
    const terms = mdp.outcomes[s][a].map((o) => `${n(o.p, 2)}\\,[${n(o.r, 2)} ${o.done ? '' : `+ ${n(gamma, 2)}(${n(prev[o.s2])})`}]`).join(' + ');
    const best = b.best.includes(a);
    return `${ACT_TEX[a]} & ${terms} & ${best ? `\\mathbf{${n(b.q[a])}}` : n(b.q[a])}`;
  });
  const tex = `\\begin{array}{c|l|r} a & \\sum_{s'} T(s,a,s')\\,[\\,r + \\gamma V_{${k - 1}}(s')\\,] & Q \\\\ \\hline ${rows.join(' \\\\ ')} \\end{array}`;
  let delta = 0;
  for (let i = 0; i < mdp.nS; i++) delta = Math.max(delta, Math.abs(vi.history[k][i] - prev[i]));
  return (
    <div className="small">
      <Rich text={`Backup of **${cellName(g, s)}** in sweep ${k}, from the values after sweep ${k - 1}:`} />
      <div className="rl-tex rl-tex-scroll">
        <TeX display>{tex}</TeX>
      </div>
      <Rich
        text={`$V_{${k}}(${cellName(g, s)}) = \\max_a Q = \\mathbf{${n(b.v)}}$, greedy action ${b.best.map((a) => ACTION_ARROWS[a]).join(' or ')}. Largest change anywhere this sweep: $${n(delta, 4)}$${vi.converged && k === vi.sweeps ? ' (below $10^{-6}$ by the last sweep: converged)' : ''}.`}
      />
    </div>
  );
}

function Inspect({ g, s, mode, Q, vi, eps }: { g: GridWorld; s: number; mode: Mode; Q: ArrayLike<number>; vi: ReturnType<typeof valueIteration>; eps: number }) {
  if (g.kind[s] === TERMINAL) return null;
  const row = [0, 1, 2, 3].map((a) => Q[s * 4 + a]);
  const probs = epsGreedyProbs(row, eps);
  const best = Math.max(...row);
  const starBest = Math.max(...[0, 1, 2, 3].map((a) => vi.Q[s * 4 + a]));
  return (
    <div className="rl-table-wrap">
      <table className="rl-table">
        <thead>
          <tr>
            <th>a</th>
            <th title={mode === 'q' ? 'Learnt Q(s,a)' : 'Q from the current V (this sweep)'}>{mode === 'q' ? 'Q(s,a)' : 'Q_k(s,a)'}</th>
            <th title="Optimal Q*(s,a) from value iteration (knows T)">Q*(s,a)</th>
            {mode === 'q' && <th title="Probability ε-greedy picks this action now">P(a) ε-greedy</th>}
          </tr>
        </thead>
        <tbody>
          {row.map((q, a) => (
            <tr key={a} className={Math.abs(q - best) < 1e-9 && mode === 'q' ? 'is-best' : undefined}>
              <td>{ACTION_ARROWS[a]}</td>
              <td>{t(q)}</td>
              <td className={Math.abs(vi.Q[s * 4 + a] - starBest) < 1e-9 ? 'rl-star' : undefined}>{t(vi.Q[s * 4 + a])}</td>
              {mode === 'q' && <td>{t(probs[a], 3)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
      <Rich className="small" text={`$V(s) = \\max_a Q(s,a) = ${n(best)}$; optimal $V^*(s) = ${n(vi.V[s])}$ and $\\pi^*(s) = \\arg\\max_a Q^*(s,a) = {${ACT_TEX[vi.policy[s]]}}$.`} />
    </div>
  );
}
