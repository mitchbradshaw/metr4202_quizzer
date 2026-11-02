// Sim-to-real: a puck-pushing policy trained in a simulator with friction μ_sim, deployed on a floor with μ_real.
// Both worlds run the same policy side by side; the performance-vs-μ_real curve shows how sharply a policy tuned to
// one simulator fails elsewhere, and how domain randomisation (a band of μ in training), system identification
// (measure μ, re-tune the simulator) and fine-tuning on hardware change it. Scenario cards sort the 2023 Q18 /
// 2024 Q18 statements into sim-to-real problems and ordinary training problems.
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import type { ExploreItem } from '../../../engine/types';
import { Button, Callout, Readout, Readouts, Slider, Toggle } from '../../../ui/kit';
import { PredictReveal } from '../../../ui/PredictReveal';
import { Rich } from '../../../ui/Rich';
import { Band, Dot, Line, Plot, VLine } from '../../../plot/Plot';
import { useRaf } from '../../../anim/hooks';
import { completeChallenge, useProgress } from '../../../app/store';
import { TARGET, deploy, deploymentTime, puckAt, scoreCurve, trainPolicy, type Deployment, type PushPolicy } from '../../../core/rl_sim2real';
import { Panel, revealLeft, t } from './rlCommon';

export const meta: Omit<ExploreItem, 'component'> = {
  id: 'sim2real',
  title: 'Sim-to-real: friction you did not train for',
  summary:
    'A robot learns in simulation to tap a puck onto a mark, then meets a real floor with different friction. Compare the two worlds side by side, plot performance against the real friction, and try domain randomisation, system identification and fine-tuning.',
  notice:
    'A policy tuned to one simulator is excellent at exactly that friction and poor a little either side; randomising the simulator flattens the curve (robust) at the cost of a little performance at the nominal value.',
  challenge: { id: 'rl-s2r-cards', title: 'Sort all ten scenario cards correctly' },
  minutes: 8,
};

const CHALLENGE_ID = 'rl-s2r-cards';
const MU_MIN = 0.1;
const MU_MAX = 1;
const SYSID_ERR = 0.04;

interface Card {
  id: string;
  text: string;
  s2r: boolean;
  why: string;
}
const CARDS: Card[] = [
  { id: 'slip', text: 'The simulator used to train a driving policy does not model wheel slip.', s2r: true, why: 'The policy learns physics that does not exist on the real car: a mismatch between simulator and reality (the 2023 Q18 answer).' },
  { id: 'contact', text: 'The grasping simulator does not model contact forces and friction accurately.', s2r: true, why: 'Contact and friction are the classic sim-to-real gap: grasps that hold in simulation slip on the real gripper (the 2024 Q18 answer).' },
  { id: 'layers', text: 'The policy network does not have enough layers.', s2r: false, why: 'Too little capacity would make it underperform in the simulator as well: a training problem, not a mismatch with reality (2023 Q18 distractor).' },
  { id: 'vi', text: 'The policy was trained with value iteration, and only policy-iteration policies can run on real robots.', s2r: false, why: 'False premise: any policy is just a map from states to actions, however it was computed (2023 Q18 distractor).' },
  { id: 'gpu', text: 'There is no GPU, so training takes a long time to converge.', s2r: false, why: 'Slow training is a compute problem; it says nothing about how the result transfers (2023 Q18 distractor).' },
  { id: 'converge', text: 'Training in simulation did not converge after many episodes.', s2r: false, why: 'It fails before it ever meets reality: a training problem (2024 Q18 distractor).' },
  { id: 'reward', text: 'The wrong reward function was used for training.', s2r: false, why: 'The policy would do the wrong thing in the simulator too: a reward-design problem (2024 Q18 distractor).' },
  { id: 'glare', text: 'Rendered camera images are perfectly lit; the real camera sees glare and motion blur.', s2r: true, why: 'A perception gap: the inputs the policy sees on the robot differ from the ones it was trained on.' },
  { id: 'latency', text: 'The real motors respond 50 ms later than the simulated ones.', s2r: true, why: 'Unmodelled actuator delay changes the dynamics, so a policy tuned to instant motors can oscillate or overshoot.' },
  { id: 'noise', text: 'The simulated sensors return perfect, noise-free readings.', s2r: true, why: 'A policy that never saw noise can over-trust its sensors; adding noise is a form of domain randomisation.' },
];

function describe(p: PushPolicy): string {
  return p.taps === 1 && p.aim >= 0.999 ? 'one full-strength push' : `up to ${p.taps} pushes, each aiming for ${Math.round(p.aim * 100)} % of the remaining distance`;
}
function missText(d: Deployment): string {
  const m = d.miss;
  if (Math.abs(m) < 0.03) return 'on the mark';
  return m > 0 ? `overshot by ${t(m, 2)} m` : `stopped ${t(-m, 2)} m short`;
}

// ------------------------------------------------------------------ the two tracks

const TX0 = 74;
const TX1 = 640;
const TRACK_M = 4;
const px = (x: number) => TX0 + (Math.max(-0.2, Math.min(TRACK_M, x)) / TRACK_M) * (TX1 - TX0);

function Tracks({ sim, real, muSim, muReal, puckSimRef, puckRealRef, botSimRef, botRealRef }: { sim: Deployment; real: Deployment; muSim: number; muReal: number; puckSimRef: RefObject<SVGCircleElement>; puckRealRef: RefObject<SVGCircleElement>; botSimRef: RefObject<SVGRectElement>; botRealRef: RefObject<SVGRectElement> }) {
  const row = (y: number, label: string, mu: number, d: Deployment, puckRef: RefObject<SVGCircleElement>, botRef: RefObject<SVGRectElement>, cls: string) => (
    <g>
      <text x={8} y={y - 24} className="rl-s2r-label">
        {label}
      </text>
      <text x={8} y={y - 8} className="rl-scene-small">
        {`μ = ${mu.toFixed(2)}`}
      </text>
      <rect x={TX0} y={y + 10} width={TX1 - TX0} height={8} className={`rl-s2r-floor ${cls}`} />
      {[0, 1, 2, 3, 4].map((m) => (
        <g key={m}>
          <line x1={px(m)} x2={px(m)} y1={y + 18} y2={y + 24} className="rl-s2r-tick" />
          <text x={px(m)} y={y + 36} textAnchor="middle" className="rl-scene-small">
            {m} m
          </text>
        </g>
      ))}
      <line x1={px(TARGET)} x2={px(TARGET)} y1={y - 30} y2={y + 18} className="rl-s2r-mark" />
      <path d={`M${px(TARGET)} ${y - 30}l16 6l-16 6Z`} className="rl-s2r-flag" />
      {d.pushes.length > 0 && d.pushes[d.pushes.length - 1].x1 > TRACK_M && (
        <text x={TX1 - 4} y={y - 8} textAnchor="end" className="rl-s2r-off">
          {`→ ${t(d.pushes[d.pushes.length - 1].x1, 1)} m`}
        </text>
      )}
      <rect ref={botRef} x={px(0) - 26} y={y - 10} width={18} height={20} rx={4} className="rl-s2r-bot" />
      <circle ref={puckRef} cx={px(0)} cy={y + 2} r={8} className="rl-s2r-puck" />
      <text x={TX1} y={y + 52} textAnchor="end" className={`rl-s2r-result ${d.score >= 0.8 ? 'is-ok' : d.score > 0 ? 'is-meh' : 'is-bad'}`}>
        {`${d.score >= 0.8 ? '✓' : '✗'} ${missText(d)} · score ${Math.round(d.score * 100)} %`}
      </text>
    </g>
  );
  return (
    <svg className="rl-s2r-svg" viewBox="0 0 660 230" role="img" aria-label={`Simulator: ${missText(sim)}. Real floor: ${missText(real)}.`}>
      {row(52, 'Simulator', muSim, sim, puckSimRef, botSimRef, 'is-sim')}
      {row(160, 'Real floor', muReal, real, puckRealRef, botRealRef, 'is-real')}
    </svg>
  );
}

export default function Sim2RealSim() {
  const challengeDone = !!useProgress().challenges?.[CHALLENGE_ID];
  const [muSim, setMuSim] = useState(0.5);
  const [muReal, setMuReal] = useState(0.35);
  const [width, setWidth] = useState(0);
  const [sysId, setSysId] = useState(false);
  const [fine, setFine] = useState(false);
  const [cards, setCards] = useState<Record<string, boolean>>({});
  const leftRef = useRef<HTMLDivElement>(null);

  // What the policy believes the friction is, then train on that (± the randomisation band).
  const muModel = fine ? muReal : sysId ? muReal * (1 + SYSID_ERR) : muSim;
  const policy = useMemo(() => trainPolicy(muModel, width), [muModel, width]);
  const baseline = useMemo(() => trainPolicy(muSim, 0), [muSim]);
  const sim = useMemo(() => deploy(policy, muModel), [policy, muModel]);
  const real = useMemo(() => deploy(policy, muReal), [policy, muReal]);
  const curve = useMemo(() => scoreCurve(policy, MU_MIN, MU_MAX), [policy]);
  const baseCurve = useMemo(() => scoreCurve(baseline, MU_MIN, MU_MAX), [baseline]);
  const showBase = width > 0 || sysId || fine;

  // ---------------------------------------------------------------- animation of both tracks
  const puckSim = useRef<SVGCircleElement>(null);
  const puckReal = useRef<SVGCircleElement>(null);
  const botSim = useRef<SVGRectElement>(null);
  const botReal = useRef<SVGRectElement>(null);
  const clock = useRef(0);
  const [running, setRunning] = useState(true);
  const total = Math.min(9, Math.max(deploymentTime(sim), deploymentTime(real)) + 0.3);
  const replay = () => {
    clock.current = 0;
    setRunning(true);
  };
  useEffect(replay, [sim, real]);
  const place = (d: Deployment, mu: number, puck: SVGCircleElement | null, bot: SVGRectElement | null) => {
    const s = puckAt(d, mu, Math.min(clock.current, 60));
    const x = px(s.x);
    puck?.setAttribute('cx', x.toFixed(1));
    // The pusher sits just behind the puck before each push.
    const p = d.pushes[s.push];
    const bx = p ? px(p.x0) - (p.v >= 0 ? 26 : -8) : px(0) - 26;
    bot?.setAttribute('x', bx.toFixed(1));
  };
  useRaf(
    (dt) => {
      clock.current += dt;
      place(sim, muModel, puckSim.current, botSim.current);
      place(real, muReal, puckReal.current, botReal.current);
      if (clock.current > total) setRunning(false);
    },
    running
  );
  useEffect(() => {
    if (!running) {
      clock.current = 1e3;
      place(sim, muModel, puckSim.current, botSim.current);
      place(real, muReal, puckReal.current, botReal.current);
    }
  });

  const nCards = CARDS.filter((c) => cards[c.id] === c.s2r).length;
  useEffect(() => {
    if (nCards === CARDS.length && !challengeDone) completeChallenge(CHALLENGE_ID);
  }, [nCards, challengeDone]);

  const setup = (o: { muReal?: number; width?: number; sysId?: boolean; fine?: boolean }) => {
    if (o.muReal !== undefined) setMuReal(o.muReal);
    if (o.width !== undefined) setWidth(o.width);
    setSysId(!!o.sysId);
    setFine(!!o.fine);
    setMuSim(0.5);
    revealLeft(leftRef.current);
  };

  const lo = muModel * (1 - width);
  const hi = muModel * (1 + width);
  const realScore = curve.find((p) => p[0] >= muReal)?.[1] ?? real.score * 100;

  const left = (
    <div className="rl-left rl-panel" ref={leftRef}>
      <Tracks sim={sim} real={real} muSim={muModel} muReal={muReal} puckSimRef={puckSim} puckRealRef={puckReal} botSimRef={botSim} botRealRef={botReal} />
      <div className="rl-bar">
        <Button size="sm" variant="primary" onClick={replay}>
          ▶ Deploy again
        </Button>
        <span className="small muted">
          Policy: {describe(policy)}
          {fine ? ' (fine-tuned on the real floor)' : sysId ? ` (trained at the identified μ = ${muModel.toFixed(3)})` : ''}.
        </span>
      </div>
      <Plot x={{ min: MU_MIN, max: MU_MAX, label: 'real floor friction μ_real' }} y={{ min: 0, max: 105, label: 'score (%)' }} height={220} ariaLabel="Score of the trained policy against the real friction">
        {width > 0 && <Band x0={lo} x1={hi} color="var(--m3)" opacity={0.12} label="trained on" />}
        {showBase && <Line points={baseCurve} color="var(--text-3)" width={1.6} dash />}
        <Line points={curve} color="var(--m1)" width={2.6} />
        <VLine x={muSim} color="var(--text-3)" label="μ_sim" />
        <VLine x={muReal} color="var(--accent)" label="μ_real" labelY="bottom" />
        <Dot x={muReal} y={realScore} color="var(--accent)" />
      </Plot>
      <Rich
        className="small muted"
        text={`Blue: score of this policy if the real floor had friction $\\mu_{\\text{real}}$ (100 % = on the mark in one push). ${showBase ? 'Dashed: the policy trained on $\\mu_{\\text{sim}}$ alone, for comparison. ' : ''}${width > 0 ? 'Green band: the frictions seen in training.' : ''}`}
      />
    </div>
  );

  const right = (
    <div className="rl-right">
      <Panel title="Worlds and training">
        <Slider label="simulator friction" tex="\mu_{\text{sim}}" tip="Friction coefficient the simulator uses" value={muSim} min={0.2} max={0.8} step={0.01} onChange={setMuSim} sig={2} />
        <Slider label="real floor friction" tex="\mu_{\text{real}}" tip="Friction coefficient of the floor the robot is deployed on" value={muReal} min={MU_MIN} max={MU_MAX} step={0.01} onChange={setMuReal} sig={2} />
        <Slider
          label="domain randomisation"
          tip="Training samples μ uniformly from μ_sim × (1 ± this fraction)"
          value={width}
          min={0}
          max={0.6}
          step={0.05}
          onChange={setWidth}
          format={(v) => (v === 0 ? 'off' : `± ${Math.round(v * 100)} %`)}
        />
        <Toggle checked={sysId} onChange={(v) => (setSysId(v), v && setFine(false))} label="System identification (measure μ_real, re-tune the simulator)" />
        <Toggle checked={fine} onChange={(v) => (setFine(v), v && setSysId(false))} label="Fine-tune on the real robot (a few real trials)" />
        <Readouts min={130}>
          <Readout label="Score in sim" text={`${Math.round(sim.score * 100)} %`} tip="Score in the world the policy was trained for" tone="m3" />
          <Readout label="Score on real floor" text={`${Math.round(real.score * 100)} %`} tip="Score after deployment" tone={real.score >= 0.8 ? 'ok' : 'bad'} />
          <Readout label="Sim-to-real gap" text={`${Math.round((sim.score - real.score) * 100)} pts`} tip="Score lost moving from the simulator to the real floor" />
          <Readout label="Pushes used (real)" text={String(real.pushes.length)} tip="Each extra push costs 6 points (the task rewards speed)" />
        </Readouts>
        <Rich
          className="small"
          text={
            fine
              ? 'Fine-tuning adapts the policy on the real floor itself: the peak sits exactly on $\\mu_{\\text{real}}$, but it costs real trials (time, wear, risk) and only fixes *this* floor.'
              : sysId
                ? `System identification measured $\\hat\\mu = ${muModel.toFixed(3)}$ (4 % off) and re-tuned the simulator: the peak moves to the real floor, but only as far as the measurement is accurate.`
                : width > 0
                  ? 'Domain randomisation: the policy never knows the exact friction, so it learns to push gently and correct. It is worse at $\\mu_{\\text{sim}}$ than the specialist, but much better away from it.'
                  : 'Trained on one friction: one confident push, perfect in the simulator. Move $\\mu_{\\text{real}}$ and watch the real puck miss.'
          }
        />
      </Panel>

      <Panel title="Why train in simulation at all? (2025 Q26)">
        <Rich
          className="small"
          text={`- **Benefits:** safe (crashes cost nothing), fast and parallel (thousands of episodes faster than real time), free resets, perfect state and reward information, and conditions you can randomise.
- **Drawback:** the *sim-to-real gap*: friction, contact, latency, sensor noise and lighting are never modelled exactly, so a policy can overfit to the simulator's quirks.
- **Fixes:** domain randomisation, system identification, fine-tuning on hardware (all three are on the left).`}
        />
      </Panel>


      <Panel title="Predict, then check" className="rl-predicts">
        <PredictReveal
          id="rl-s2r-overshoot"
          question="Trained in a simulator with $\mu_{\text{sim}} = 0.5$ (no randomisation), the robot is deployed on a polished floor with $\mu_{\text{real}} = 0.3$. Where does the puck stop?"
          options={['Short of the mark', 'On the mark', 'Past the mark']}
          answer={2}
          explain="The push speed was tuned so that $v^2 / (2 \cdot 0.5\, g) = 2$ m. With less friction the same push slides $d = v^2/(2\mu g)$, i.e. $2 \times 0.5 / 0.3 = 3.33$ m: it overshoots by 1.33 m and scores 0. The policy was perfect in its simulator and never saw anything else: that is the sim-to-real gap."
          tryIt="set μ_real to 0.30 with randomisation off and watch the two tracks."
          onApply={() => setup({ muReal: 0.3, width: 0 })}
        />
        <PredictReveal
          id="rl-s2r-dr"
          question="Now randomise the friction by ±50 % during training. On a real floor that matches the simulator ($\mu_{\text{real}} = 0.5$), the new policy scores…"
          options={['Higher than the specialist (100 %)', 'Exactly the same, 100 %', 'A bit lower, but far better away from 0.5']}
          answer={2}
          explain="Unsure of $\mu$, the trained policy pushes gently (about 78 % of the remaining distance) and corrects with up to four pushes, so it scores about 83 % at 0.5 (extra pushes cost time) but about 79 % at 0.3, where the specialist scored 0. Robustness is bought with a little nominal performance: a flatter, lower curve."
          tryIt="set domain randomisation to ±50 % and compare the blue curve with the dashed one."
          onApply={() => setup({ muReal: 0.5, width: 0.5 })}
        />
        <PredictReveal
          id="rl-s2r-sysid"
          question="Instead, system identification measures the real floor's friction (to within a few per cent) and the simulator is re-tuned before retraining. With $\mu_{\text{real}} = 0.3$, the real score…"
          options={['Rises to near 100 %: the peak moves to about 0.3', 'Stays near 0', 'Falls even lower']}
          answer={0}
          explain="Re-tuning the simulator moves the whole curve so that its peak sits at the identified $\hat\mu \approx 0.31$. A 4 % identification error leaves the puck about 8 cm past the mark (score ≈ 84 %), so identification is only as good as the measurement, and the policy is still a specialist if the floor changes again."
          tryIt="switch on system identification with μ_real = 0.30."
          onApply={() => setup({ muReal: 0.3, width: 0, sysId: true })}
        />
      </Panel>
    </div>
  );

  return (
    <div className="rl-sim">
      <div className="rl-layout">
        {left}
        {right}
      </div>
      <Panel title={`Is it a sim-to-real problem? (${nCards} of ${CARDS.length} sorted correctly)`} className="rl-s2r-cards">
        <Rich className="small" text="Test: would the policy also fail **in the simulator**? Then it is an ordinary training problem. Sim-to-real means it works in simulation but fails on the robot **because the simulator differs from reality** (2023 Q18, 2024 Q18)." />
        <ul className="rl-cards">
          {CARDS.map((c) => {
            const a = cards[c.id];
            const done = a !== undefined;
            const ok = a === c.s2r;
            return (
              <li key={c.id} className={done ? (ok ? 'is-ok' : 'is-bad') : undefined}>
                <div className="rl-card-row">
                  <Rich className="small" text={c.text} />
                  <div className="rl-card-btns" role="group" aria-label="Is this a sim-to-real problem?">
                    <Button size="sm" variant={done && a ? (ok ? 'ok' : 'danger') : 'default'} onClick={() => setCards((s) => ({ ...s, [c.id]: true }))} title="Sim-to-real problem">
                      Sim-to-real
                    </Button>
                    <Button size="sm" variant={done && !a ? (ok ? 'ok' : 'danger') : 'default'} onClick={() => setCards((s) => ({ ...s, [c.id]: false }))} title="Not a sim-to-real problem">
                      Not
                    </Button>
                  </div>
                </div>
                {done && <Rich className="small" text={`${ok ? '✓' : '✗'} ${c.why}`} />}
              </li>
            );
          })}
        </ul>
        {(challengeDone || nCards === CARDS.length) && (
          <Callout kind="ok" title="Challenge complete">
            <Rich text="Only a mismatch between the simulator and reality counts. Capacity, compute, convergence and reward design would all show up in the simulator first." />
          </Callout>
        )}
      </Panel>
    </div>
  );
}
