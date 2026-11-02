// Credit assignment: N robots each pick one of N inspection sites; the team reward G counts each covered site once.
// Learning from G alone, a robot cannot tell its own contribution from everyone else's exploration, and the
// signal gets noisier as the team grows; the difference reward D_i = G(z) − G(z_−i) isolates what robot i adds.
// A selfish local reward (my site's value) is clean but misaligned: robots crowd the best site.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { ExploreItem } from '../../../engine/types';
import { Button, Callout, More, Readout, Readouts, Segmented, Slider } from '../../../ui/kit';
import { StepControls, useStepper } from '../../../ui/stepper';
import { PredictReveal } from '../../../ui/PredictReveal';
import { Rich } from '../../../ui/Rich';
import { HLine, Line, Plot } from '../../../plot/Plot';
import { contributionCorr, differenceReward, learnCoverage, siteValues, teamReward, type CreditSignal } from '../../../core/multi_credit';
import { Panel, f, revealLeft } from './multiCommon';

export const meta: Omit<ExploreItem, 'component'> = {
  id: 'credit',
  title: 'Credit assignment: whose work earned the team reward?',
  summary:
    'Robots learn which site to inspect from a reward signal. With the **global** team reward $G$, each robot’s own effect is buried in its teammates’ exploration; the **difference reward** $D_i = G(z) - G(z_{-i})$ (team reward minus the reward without robot $i$) measures exactly what robot $i$ contributed.',
  notice:
    'Click a robot and remove it: $D_i$ is how much the team loses. With $G$ alone, learning slows to a crawl as the team grows; with $D_i$ it does not, because each robot can finally see its own contribution.',
  minutes: 8,
};

const EPISODES = 600;
const V4 = siteValues(4);
const V4max = Math.max(...V4);
const V4sum = V4.reduce((a, b) => a + b, 0);
const ALPHA = 0.1;
const EPS = 0.15;
const SIGNALS: { id: CreditSignal; label: string; color: string; tex: string; long: string }[] = [
  { id: 'global', label: 'Global G', color: 'var(--m1)', tex: 'r_i = G(z)', long: 'everyone gets the team reward' },
  { id: 'difference', label: 'Difference Dᵢ', color: 'var(--m3)', tex: 'r_i = G(z) - G(z_{-i})', long: 'the team reward minus the team reward without robot i' },
  { id: 'local', label: 'Local (selfish)', color: 'var(--m2)', tex: 'r_i = v_{\\text{my site}}', long: 'the value of my own site, ignoring teammates' },
];

// Expensive, settings-independent curves, computed once.
let qualityCache: { N: number; global: number; difference: number; local: number }[] | null = null;
function qualityCurves() {
  if (!qualityCache) {
    qualityCache = [];
    for (let N = 2; N <= 20; N++) qualityCache.push({ N, global: contributionCorr('global', N, N), difference: contributionCorr('difference', N, N), local: contributionCorr('local', N, N) });
  }
  return qualityCache;
}
let finalCache: { N: number; global: number; difference: number; local: number }[] | null = null;
function finalCurves() {
  if (!finalCache) {
    finalCache = [2, 4, 6, 8, 12, 16, 20].map((N) => {
      const row = { N, global: 0, difference: 0, local: 0 };
      for (const s of ['global', 'difference', 'local'] as const) {
        let acc = 0;
        for (const seed of [1, 2]) acc += learnCoverage({ N, K: N, signal: s, alpha: ALPHA, eps: EPS, episodes: EPISODES, seed }).greedyPerf[EPISODES - 1];
        row[s] = acc / 2;
      }
      return row;
    });
  }
  return finalCache;
}

function movingAvg(x: ArrayLike<number>, upto: number, w = 25): [number, number][] {
  const out: [number, number][] = [];
  let s = 0;
  const step = Math.max(1, Math.floor(upto / 300));
  for (let e = 0; e <= upto; e++) {
    s += x[e];
    if (e >= w) s -= x[e - w];
    if (e % step === 0 || e === upto) out.push([e + 1, s / Math.min(e + 1, w)]);
  }
  return out;
}

// ------------------------------------------------------------------ the field

const FW = 620;
const STACK = 5;
const BASE = 40 + STACK * 25;
const FH = BASE + 50;

function Field({ values, choice, sel, removed, onRobot, onSite }: { values: number[]; choice: ArrayLike<number>; sel: number; removed: boolean; onRobot: (i: number) => void; onSite: (k: number) => void }) {
  const K = values.length;
  const N = choice.length;
  const gap = (FW - 40) / K;
  const sx = (k: number) => 20 + gap * (k + 0.5);
  const covered = new Array<number>(K).fill(0);
  for (let i = 0; i < N; i++) if (!(removed && i === sel)) covered[choice[i]]++;
  const stack = new Array<number>(K).fill(0);
  const rr = Math.min(11, gap / 2 - 2);
  const parts: ReactNode[] = [];
  values.forEach((v, k) => {
    const r = Math.min(gap / 2 - 1, 7 + 4 * v);
    parts.push(
      <g key={`s${k}`} className="multi-site-g" role="button" tabIndex={0} aria-label={`Site ${k + 1}, value ${v}${covered[k] ? `, covered by ${covered[k]}` : ', not covered'}. Move the selected robot here.`} onClick={() => onSite(k)} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onSite(k))}>
        <circle cx={sx(k)} cy={BASE + 10} r={r} className={covered[k] ? 'multi-site is-covered' : 'multi-site'} />
        <text x={sx(k)} y={BASE + 14} textAnchor="middle" className="multi-site-v">
          {v.toFixed(1)}
        </text>
        <text x={sx(k)} y={BASE + 42} textAnchor="middle" className="multi-tlabel">
          {k + 1}
        </text>
      </g>
    );
  });
  for (let i = 0; i < N; i++) {
    const k = choice[i];
    const h = stack[k]++;
    const ghost = removed && i === sel;
    if (h >= STACK) continue;
    const y = BASE - 12 - rr - h * (2 * rr + 3);
    const dup = covered[k] > 1 && !ghost;
    parts.push(
      <g key={`r${i}`} className="multi-bot-g" role="button" tabIndex={0} aria-label={`Robot ${i + 1} at site ${k + 1}${i === sel ? ' (selected)' : ''}`} onClick={() => onRobot(i)} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onRobot(i))}>
        <circle cx={sx(k)} cy={y} r={rr} className={`multi-bot ${dup ? 'is-dup' : ''} ${ghost ? 'is-ghost' : ''} ${i === sel ? 'is-sel' : ''}`} />
        {rr >= 7 && (
          <text x={sx(k)} y={y + 3.5} textAnchor="middle" className="multi-bot-label">
            {i + 1}
          </text>
        )}
      </g>
    );
  }
  for (let k = 0; k < K; k++)
    if (stack[k] > STACK)
      parts.push(
        <text key={`more${k}`} x={sx(k)} y={BASE - 20 - STACK * (2 * rr + 3)} textAnchor="middle" className="multi-more">
          +{stack[k] - STACK} more
        </text>
      );
  return (
    <svg className="multi-field" viewBox={`0 0 ${FW} ${FH}`} role="img" aria-label={`${N} robots choosing among ${K} sites`}>
      {parts}
    </svg>
  );
}

export default function CreditSim() {
  const [N, setN] = useState(8);
  const [signal, setSignal] = useState<CreditSignal>('global');
  const [seed, setSeed] = useState(1);
  const [sel, setSel] = useState(0);
  const [removed, setRemoved] = useState(false);
  const [manual, setManual] = useState<number[] | null>(null);
  const leftRef = useRef<HTMLDivElement>(null);

  const runs = useMemo(() => {
    const o = {} as Record<CreditSignal, ReturnType<typeof learnCoverage>>;
    for (const s of SIGNALS) o[s.id] = learnCoverage({ N, K: N, signal: s.id, alpha: ALPHA, eps: EPS, episodes: EPISODES, seed });
    return o;
  }, [N, seed]);
  const run = runs[signal];
  const st = useStepper(EPISODES - 1, { speed: 30 });
  const jumpEnd = useRef(false);
  useEffect(() => {
    setManual(null);
    if (jumpEnd.current) {
      jumpEnd.current = false;
      st.setI(EPISODES - 1);
    } else {
      st.reset();
      st.play();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run]);
  const e = Math.min(st.i, EPISODES - 1);
  const values = run.values;
  const choice = manual ?? Array.from(run.choices.subarray(e * N, (e + 1) * N));
  const s = Math.min(sel, N - 1);
  const G = teamReward(choice, values);
  const Gm = teamReward(choice, values, s);
  const D = differenceReward(choice, values, s);
  const L = values[choice[s]];
  const mates = choice.map((k, j) => (k === choice[s] && j !== s ? j + 1 : 0)).filter(Boolean);
  const r = signal === 'global' ? G : signal === 'difference' ? D : L;

  const curves = useMemo(() => SIGNALS.map((sg) => ({ ...sg, pts: movingAvg(runs[sg.id].perf, e) })), [runs, e]);
  const quality = qualityCurves();
  const finals = finalCurves();

  const setup = (o: { N?: number; signal?: CreditSignal; end?: boolean; dupDemo?: boolean }) => {
    setRemoved(false);
    const willChange = (o.N !== undefined && o.N !== N) || (o.signal !== undefined && o.signal !== signal);
    if (o.end) {
      if (willChange) jumpEnd.current = true;
      else {
        setManual(null);
        st.setI(EPISODES - 1);
      }
    }
    if (o.N !== undefined) setN(o.N);
    if (o.signal) setSignal(o.signal);
    if (o.dupDemo) {
      const base = Array.from(run.choices.subarray(0, N));
      base[0] = base[1];
      setManual(base);
      setSel(0);
      setRemoved(true);
      st.pause();
    }
    revealLeft(leftRef.current);
  };

  const onSite = (k: number) => {
    const next = [...choice];
    next[s] = k;
    setManual(next);
    st.pause();
  };

  const left = (
    <div className="multi-left multi-panel" ref={leftRef}>
      <div className="multi-bar">
        <Segmented label="Learning signal" value={signal} onChange={setSignal} options={SIGNALS.map((sg) => ({ value: sg.id, label: sg.label, title: sg.long }))} />
      </div>
      <Field values={values} choice={choice} sel={s} removed={removed} onRobot={(i) => setSel(i)} onSite={onSite} />
      {manual ? (
        <div className="multi-bar">
          <span className="small">Your arrangement (click a robot, then a site, to move it).</span>
          <Button size="sm" onClick={() => setManual(null)}>
            Back to the learning run
          </Button>
        </div>
      ) : (
        <StepControls st={st} label="episode" speeds={[10, 30, 100, 300]} />
      )}
      <div className="multi-cf">
        <div className="multi-bar">
          <strong className="small">Robot {s + 1}</strong>
          <Button size="sm" variant={removed ? 'primary' : 'default'} onClick={() => setRemoved((x) => !x)} aria-pressed={removed}>
            {removed ? 'Put robot back' : `Remove robot ${s + 1}`}
          </Button>
        </div>
        <Readouts min={112}>
          <Readout tex="G(z)" text={G.toFixed(2)} tip="Team reward: total value of the covered sites" tone="m1" />
          <Readout tex="G(z_{-i})" text={Gm.toFixed(2)} tip="Team reward if robot i were not there" />
          <Readout tex="D_i" text={D.toFixed(2)} tip="Difference reward: what robot i adds to the team" tone="m3" />
          <Readout tex="r_i" text={r.toFixed(2)} tip={`What robot ${s + 1} learns from with the ${SIGNALS.find((x) => x.id === signal)!.label} signal`} tone="accent" />
        </Readouts>
        <Rich
          className="small"
          text={
            mates.length
              ? `Robot ${s + 1} shares site ${choice[s] + 1} with robot${mates.length > 1 ? 's' : ''} ${mates.join(', ')}: without it the site is still covered, so $D_i = ${f(G, 2)} - ${f(Gm, 2)} = 0$. It contributes nothing here, yet with the global signal it is still paid $G = ${f(G, 2)}$.`
              : `Robot ${s + 1} is alone at site ${choice[s] + 1} (value ${f(L, 2)}): removing it uncovers the site, so $D_i = ${f(G, 2)} - ${f(Gm, 2)} = ${f(D, 2)}$, exactly its contribution.`
          }
        />
      </div>
      <Plot x={{ min: 1, max: EPISODES, label: 'episode' }} y={{ min: 0.4, max: 1.02, label: 'G / best' }} height={170} ariaLabel="Team reward over the learning run for each signal">
        <HLine y={1} color="var(--text-3)" />
        {curves.map((c) => (
          <Line key={c.id} points={c.pts} color={c.color} width={c.id === signal ? 2.8 : 1.4} dash={c.id === signal ? undefined : true} />
        ))}
      </Plot>
      <Rich className="small muted" text={`Team reward as a fraction of the best possible (every site covered), moving average of 25 episodes. Solid: the selected signal; dashed: the other two, same robots, same seed. Blue global, green difference, orange local.`} />
    </div>
  );

  const right = (
    <div className="multi-right">
      <Panel title="Team and learning">
        <Slider label="robots (and sites)" tip="N robots and N sites: a perfect spread covers every site" value={N} min={2} max={20} step={1} onChange={(v) => setN(Math.round(v))} format={(v) => String(Math.round(v))} />
        <div className="multi-bar">
          <Button size="sm" onClick={() => st.setI(EPISODES - 1)}>
            ⏭ Train to the end
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSeed((x) => x + 1)}>
            ↻ New run
          </Button>
        </div>
        <Rich
          className="small"
          text={`Each robot keeps a value for every site and learns $Q_i(k) \\leftarrow Q_i(k) + \\alpha\\,(r_i - Q_i(k))$ with $\\alpha = ${ALPHA}$, choosing ε-greedily ($\\varepsilon = ${EPS}$). Only the signal $r_i$ differs: $${SIGNALS.find((x) => x.id === signal)!.tex}$, ${SIGNALS.find((x) => x.id === signal)!.long}.`}
        />
        <Readouts min={120}>
          <Readout label="Episode" text={`${e + 1} / ${EPISODES}`} tip="One episode = every robot picks a site once" />
          <Readout label="Sites covered" text={`${choice.reduce((acc, k, j) => (choice.indexOf(k) === j ? acc + 1 : acc), 0)} / ${N}`} tip="Distinct sites with at least one robot" />
          <Readout label="G / best" text={`${Math.round((G / run.best) * 100)} %`} tip="Team reward relative to every site covered" tone="m1" />
        </Readouts>
      </Panel>

      <Panel title="Can robot i see its own effect?">
        <Plot x={{ min: 2, max: 20, label: 'team size N' }} y={{ min: 0, max: 1.05, label: 'corr(rᵢ, Dᵢ)' }} height={170} ariaLabel="How well each signal reports robot i's own contribution, against team size">
          {SIGNALS.map((sg) => (
            <Line key={sg.id} points={quality.map((q) => [q.N, q[sg.id]] as [number, number])} color={sg.color} width={sg.id === signal ? 2.8 : 1.6} dash={sg.id === signal ? undefined : true} />
          ))}
        </Plot>
        <Rich
          className="small"
          text="Correlation between the signal a robot learns from and its true contribution $D_i$, early in learning (teammates choosing at random). The global $G$ falls roughly like $1/\sqrt{N}$: in a big team, whatever robot $i$ does is swamped by what the others happen to do. $D_i$ stays at 1 by construction."
        />
        <Plot x={{ min: 2, max: 20, label: 'team size N' }} y={{ min: 0.2, max: 1.05, label: 'G / best after 600' }} height={160} ariaLabel="Team performance after 600 episodes against team size">
          {SIGNALS.map((sg) => (
            <Line key={sg.id} points={finals.map((q) => [q.N, q[sg.id]] as [number, number])} color={sg.color} width={sg.id === signal ? 2.8 : 1.6} dash={sg.id === signal ? undefined : true} />
          ))}
        </Plot>
        <Rich className="small" text="Greedy team performance after 600 episodes (mean of 2 runs). Learning from $G$ works for 2–4 robots and then collapses to about what random choices give; $D_i$ learns a perfect spread at every size; the selfish local reward crowds the valuable sites." />
      </Panel>

      <Panel title="In the exam">
        <Rich
          className="small"
          text={`- **Credit assignment** is quantifying each robot’s contribution to the team’s performance (2024 Q20; “structural credit assignment”, 2025 Q20). It is not task allocation, workload balancing or setting up roles.
- **Global coordination** optimises the **joint** state–action value $Q(s, a_1, \\dots, a_N)$ of the whole team (2023 Q20), not a sum or average of individual values and not a leader's value. Here $G(z)$ depends on the joint choice $z$: covering a site twice adds nothing, so the individual values do not simply add.
- The difference reward is one standard answer: it is **aligned** with $G$ (raising $D_i$ raises $G$) and **learnable** (it moves only when robot $i$’s choice matters).`}
        />
      </Panel>

      <Panel title="Predict, then check" className="multi-predicts">
        <PredictReveal
          id="multi-credit-diff"
          question="Robot 1 has moved onto the same site as robot 2. What is its difference reward $D_1 = G(z) - G(z_{-1})$?"
          options={['0', 'The value of that site', 'G divided by the number of robots']}
          answer={0}
          explain="Take robot 1 away and robot 2 still covers the site, so the team reward does not change: $G(z_{-1}) = G(z)$ and $D_1 = 0$. Robot 1 is doing duplicated work and $D_1$ says so. The global signal would still have paid it the full $G$, which is exactly why it cannot learn to move."
          tryIt="click robot 1, then click robot 2's site; press Remove robot 1 and compare G with G(z₋ᵢ)."
          onApply={() => setup({ dupDemo: true })}
        />
        <PredictReveal
          id="multi-credit-global"
          question="20 robots, 20 sites, every robot learning from the global team reward $G$ for 600 episodes. How well do they end up spreading out?"
          options={['Almost every site covered', 'Not much better than picking sites at random', 'All 20 crowd onto the most valuable site']}
          answer={1}
          explain="From robot $i$'s point of view, $G$ changes mostly because 19 teammates explore at random; its own choice moves $G$ by at most one site's value. That learning signal is so noisy that after 600 episodes the team covers only about as many sites as random choices would (about two thirds). Switch the signal to $D_i$: same robots, same exploration, a perfect spread."
          tryIt="set 20 robots, the global signal, and train to the end; then switch to the difference signal."
          onApply={() => setup({ N: 20, signal: 'global', end: true })}
        />
        <PredictReveal
          id="multi-credit-local"
          question="4 robots, 4 sites, each robot rewarded only by the value of its own site (local, selfish reward). Where do they end up?"
          options={['One robot per site', 'Crowded on the most valuable site', 'Spread at random']}
          answer={1}
          explain={`The local reward is perfectly learnable (it depends only on my choice) but **misaligned**: it pays every robot ${f(V4max, 2)} for sitting on the best site whether or not someone else is already there. Each robot learns that the best site is best, so they pile onto it and the team covers one site ($G = ${f(V4max, 2)}$ of a possible ${f(V4sum, 2)}$). A good credit-assignment signal must be both aligned with the team objective and sensitive to my own action: the difference reward is both.`}
          tryIt="set 4 robots, the local signal, and train to the end."
          onApply={() => setup({ N: 4, signal: 'local', end: true })}
        />
      </Panel>
    </div>
  );

  return (
    <div className="multi-sim">
      <div className="multi-layout">
        {left}
        {right}
      </div>
      <More label="The task and the three signals">
        <Rich
          text={`$N$ robots choose among $N$ sites with values $v_k$ between 1 and 3. The team reward counts each covered site once: $G(z) = \\sum_k v_k\\,[\\text{site } k \\text{ has at least one robot}]$, where $z$ is the joint choice. The best possible $G$ covers every site.

- **Global:** $r_i = G(z)$ for every robot. Aligned with the team, but noisy for robot $i$.
- **Difference:** $r_i = D_i = G(z) - G(z_{-i})$, with $z_{-i}$ the same joint choice without robot $i$. Here $D_i = v_k$ if robot $i$ is alone at its site $k$, else 0.
- **Local:** $r_i = v_k$ of robot $i$'s own site, whether or not it is shared. Clean but selfish.`}
        />
      </More>
    </div>
  );
}
