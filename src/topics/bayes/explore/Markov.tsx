// "Does this break the Markov assumption?" (markov). Seven scenario cards to sort (memoryless noise, or a hidden
// variable that carries the past?), then a live 1-D Bayes filter on the same readings with two different states:
// position only (it keeps the cold-sensor / new-motor model) or position + the hidden variable (temperature, motor
// health). With the hidden variable left out the belief stays narrow while the truth drifts out of it: overconfident
// and wrong. The consistency plot shows the error leaving the filter's own ±2σ band.
import { useMemo, useRef, useState } from 'react';
import type { ExploreItem } from '../../../engine/types';
import { Button, Callout, More, Segmented, Toggle } from '../../../ui/kit';
import { PredictReveal } from '../../../ui/PredictReveal';
import { Rich } from '../../../ui/Rich';
import { StepControls, useStepper } from '../../../ui/stepper';
import { Area, Dot, HLine, Line, Plot } from '../../../plot/Plot';
import { recordPrediction } from '../../../app/store';
import { BayesLayout, Panel, f2, revealVisual } from './common';
import { MARKOV_CARDS, N_CELLS, STEPS, coverage, credibleSet, kernelTrue, meanSd, rmsError, runMarkov, type MarkovMode, type Track } from './markovEngine';

export const meta: Omit<ExploreItem, 'component'> = {
  id: 'markov',
  title: 'Does this break the Markov assumption?',
  summary:
    'Sort seven situations: memoryless noise, or a hidden variable that carries the past? Then run a Bayes filter whose sensor heats up (or whose motor wears out) while its state is the position alone, watch it become **overconfident and wrong**, and add the hidden variable to the state to fix it.',
  notice:
    'Random noise that is independent at every step is fine. Anything that makes the past matter **once the current state is known** (temperature, wear, battery level) breaks the assumption, until you put it in the state.',
  minutes: 8,
};

const MODES: { value: MarkovMode; label: string; title: string }[] = [
  { value: 'random', label: 'Random noise only', title: 'Wheel slip, gusts and sensor noise, all random and independent at every step' },
  { value: 'heat', label: 'Sensor heats up', title: 'The sensor’s noise grows as it warms up from 20 °C to 80 °C' },
  { value: 'motor', label: 'Motor wears out', title: 'The motor (or battery) fades, so each command moves the robot less' },
];
const HIDDEN: Record<MarkovMode, string> = { random: 'nothing hidden', heat: 'temperature', motor: 'motor health (battery)' };
/** Short names for the comparison table, so its four columns fit the right-hand panel. */
const HIDDEN_SHORT: Record<MarkovMode, string> = { random: 'nothing', heat: 'temperature', motor: 'motor health' };

// belief picture geometry
const VW = 600;
const PAD_L = 34;
const PAD_R = 6;
const CW = (VW - PAD_L - PAD_R) / N_CELLS;
const TRACK_Y = 34;
const BEL_T = 92;
const BEL_H = 128;
const VH = BEL_T + BEL_H + 22;
const Y_MAX = 0.8;
const cx = (i: number) => PAD_L + (i + 0.5) * CW;

export default function Markov() {
  const [mode, setMode] = useState<MarkovMode>('heat');
  const [aug, setAug] = useState(false);
  const [seed, setSeed] = useState(1);
  const run = useMemo(() => runMarkov(mode, seed), [mode, seed]);
  const st = useStepper(STEPS, { speed: 8 });
  const leftRef = useRef<HTMLDivElement>(null);
  const i = st.i;
  const tr: Track = aug && mode !== 'random' ? run.aug : run.naive;

  const go = (m: MarkovMode, withHidden: boolean, play = true) => {
    setMode(m);
    setAug(withHidden);
    st.setI(0);
    if (play) st.play();
    revealVisual(leftRef.current);
  };

  // ---------------------------------------------------------------- the picture
  const bel = tr.bel[i];
  const set = credibleSet(bel);
  const truth = run.truth[i];
  const z = run.z[i];
  const sT = run.sTrue[i];
  const sM = i ? tr.sigma[i] : run.sTrue[0];
  const kT = kernelTrue(mode, i);
  const advT = kT[1] + 2 * kT[2];
  const kM = aug ? kT : kernelTrue(mode, 0);
  const advM = kM[1] + 2 * kM[2];
  const inside = tr.inside[i];
  const bracket = (c: number, half: number, y: number, color: string, dash?: string) => {
    const x1 = Math.max(PAD_L, cx(c) - half * CW);
    const x2 = Math.min(VW - PAD_R, cx(c) + half * CW);
    return (
      <g stroke={color} strokeWidth={2} strokeDasharray={dash}>
        <line x1={x1} x2={x2} y1={y} y2={y} />
        <line x1={x1} x2={x1} y1={y - 5} y2={y + 5} strokeDasharray={undefined} />
        <line x1={x2} x2={x2} y1={y - 5} y2={y + 5} strokeDasharray={undefined} />
      </g>
    );
  };
  const picture = (
    <svg className="bayes-mk-svg" viewBox={`0 0 ${VW} ${VH}`} width="100%" role="img" aria-label={`Step ${i} of ${STEPS}. Truth at cell ${truth}${i ? `, reading ${z}` : ''}. Belief mean ${f2(tr.mean[i])}, standard deviation ${f2(tr.sd[i])} cells; the truth is ${inside ? 'inside' : 'outside'} the filter’s 95 % set.`}>
      {/* the line the robot drives along */}
      <line x1={PAD_L} x2={VW - PAD_R} y1={TRACK_Y} y2={TRACK_Y} stroke="var(--text-3)" strokeWidth={6} strokeLinecap="round" opacity={0.35} />
      {mode === 'heat' && (
        <g>
          {bracket(truth, 2 * sT, TRACK_Y + 22, 'var(--m2)')}
          {bracket(truth, 2 * sM, TRACK_Y + 36, 'var(--pred)', '5 3')}
        </g>
      )}
      {i > 0 && (
        <g>
          <path d={`M${cx(z)} ${TRACK_Y - 4} l-6 -10 h12 z`} fill="var(--m2)" />
          <text x={cx(z)} y={TRACK_Y - 18} textAnchor="middle" className="bayes-axis-label" fill="var(--m2)">
            z
          </text>
        </g>
      )}
      <circle cx={cx(truth)} cy={TRACK_Y} r={8} fill="var(--m3)" stroke="var(--surface)" strokeWidth={2} />
      <text x={PAD_L - 6} y={TRACK_Y + 4} textAnchor="end" className="bayes-tick">
        world
      </text>
      {/* belief */}
      <text x={PAD_L - 6} y={BEL_T + 4} textAnchor="end" className="bayes-tick">
        {Y_MAX}
      </text>
      <text x={PAD_L - 6} y={BEL_T + BEL_H + 4} textAnchor="end" className="bayes-tick">
        0
      </text>
      <line x1={PAD_L} x2={VW - PAD_R} y1={BEL_T + BEL_H} y2={BEL_T + BEL_H} className="bayes-gridline" />
      <line x1={PAD_L} x2={VW - PAD_R} y1={BEL_T} y2={BEL_T} className="bayes-gridline" />
      {[...set].map((c) => (
        <rect key={`s${c}`} x={PAD_L + c * CW} y={BEL_T} width={CW} height={BEL_H} fill="var(--m1)" opacity={0.12} />
      ))}
      {bel.map((v, c) =>
        v > 1e-4 ? <rect key={c} x={PAD_L + c * CW + 0.6} y={BEL_T + BEL_H - (Math.min(v, Y_MAX) / Y_MAX) * BEL_H} width={CW - 1.2} height={(Math.min(v, Y_MAX) / Y_MAX) * BEL_H} fill="var(--m1)" /> : null
      )}
      <line x1={cx(truth)} x2={cx(truth)} y1={TRACK_Y + 8} y2={BEL_T + BEL_H} stroke="var(--m3)" strokeWidth={1.6} strokeDasharray="4 3" />
      {Array.from({ length: N_CELLS / 10 + 1 }, (_, k) => k * 10).map((c) => (
        <text key={c} x={PAD_L + c * CW} y={BEL_T + BEL_H + 15} textAnchor="middle" className="bayes-tick">
          {c}
        </text>
      ))}
    </svg>
  );

  // ---------------------------------------------------------------- consistency plot
  const upto = Math.max(1, i);
  const ts = Array.from({ length: i + 1 }, (_, t) => t);
  const err = ts.map((t) => [t, Math.max(-9.5, Math.min(9.5, tr.mean[t] - run.truth[t]))] as const);
  const plot = (
    <Plot x={{ min: 0, max: STEPS, label: 'step' }} y={{ min: -10, max: 10, label: 'mean − truth (cells)' }} height={170} ariaLabel="Error of the belief mean against the filter’s own ±2σ band, step by step">
      <Area points={ts.map((t) => [t, 2 * tr.sd[t]] as const)} color="var(--m1)" opacity={0.18} />
      <Area points={ts.map((t) => [t, -2 * tr.sd[t]] as const)} color="var(--m1)" opacity={0.18} />
      <HLine y={0} color="var(--text-3)" dash={false} width={1} />
      <Line points={err} color="var(--text-2)" width={1.5} />
      {err.map(([t, e]) => (t ? <Dot key={t} x={t} y={e} r={2.6} color={tr.inside[t] ? 'var(--ok)' : 'var(--bad)'} /> : null))}
    </Plot>
  );

  const covNow = coverage(tr, upto);
  const status =
    mode === 'heat'
      ? `Sensor at **${run.temp[i].toFixed(0)} °C**: its noise is really $\\sigma$ = ${f2(sT)} cells (orange), and this filter assumes $\\sigma$ = ${f2(sM)} cells (dashed).`
      : mode === 'motor'
        ? `Motor health **${f2(run.health[i])}**: a command really moves the robot ${f2(advT)} cells on average, and this filter assumes ${f2(advM)}.`
        : `Slip, gusts and sensor noise ($\\sigma$ = ${f2(sT)} cells) are random and independent at every step, and the filter’s models match them.`;

  const left = (
    <div ref={leftRef} className="bayes-panel bayes-left-stack">
      <div className="bayes-row">
        <Segmented size="sm" label="World" value={mode} onChange={(m: MarkovMode) => go(m, aug, true)} options={MODES} />
      </div>
      <div className="bayes-row">
        {mode === 'random' ? (
          <span className="small muted">Nothing is hidden here: the position is a complete state.</span>
        ) : (
          <Toggle checked={aug} onChange={setAug} label={`Add ${HIDDEN[mode]} to the state`} />
        )}
        <Button size="sm" variant="ghost" onClick={() => (setSeed((s) => s + 1), st.setI(0))} title="A new random world (new slips and sensor noise)">
          New random run
        </Button>
      </div>
      {picture}
      <div className="bayes-legend-line small">
        <span>
          <span className="bayes-dot" style={{ background: 'var(--m3)', borderRadius: '50%' }} /> true position
        </span>
        <span>
          <span className="bayes-dot" style={{ background: 'var(--m2)' }} /> reading z
        </span>
        <span>
          <span className="bayes-dot" style={{ background: 'var(--m1)' }} /> belief (shaded: its 95 % set)
        </span>
        {mode === 'heat' && <span>orange: true ±2σ of the sensor · dashed: the ±2σ the filter assumes</span>}
      </div>
      <StepControls st={st} />
      <Rich className="small" text={`${status} ${i ? (inside ? 'The truth is **inside** the belief’s 95 % set.' : 'The truth is **outside** the belief’s 95 % set.') : ''}`} />
      {plot}
      <p className="small muted bayes-tight">
        <span className="bayes-dot" style={{ background: 'var(--ok)', borderRadius: '50%' }} /> truth inside the 95 % set &nbsp;
        <span className="bayes-dot" style={{ background: 'var(--bad)', borderRadius: '50%' }} /> outside &nbsp; shaded: the filter’s own ±2σ. A consistent filter keeps the error inside its band about 95 % of the time.
      </p>
    </div>
  );

  // ---------------------------------------------------------------- right column
  const cmp = (t: Track) => ({ cov: coverage(t, upto), rms: rmsError(t, run.truth, upto), sd: meanSd(t, upto) });
  const a = cmp(run.naive);
  const b = cmp(run.aug);
  const showAug = aug && mode !== 'random';
  // At step 0 nothing has been measured yet: show dashes rather than step 1's numbers.
  const started = i > 0;
  const cell = (s: string) => (started ? s : '—');
  const right = (
    <>
      <Panel title={started ? `Same readings, two states (steps 1–${i})` : 'Same readings, two states'} live>
        <div className="bayes-table-wrap">
          <table className="bayes-table bayes-mk-table">
            <thead>
              <tr>
                <th className="is-left">state</th>
                <th title="Fraction of steps with the true cell inside the filter’s 95 % set">truth inside</th>
                <th title="Root-mean-square distance between the belief mean and the truth">RMS error</th>
                <th title="The filter’s own standard deviation, averaged: how sure it claims to be">claimed σ</th>
              </tr>
            </thead>
            <tbody>
              <tr className={!showAug ? 'is-best' : undefined}>
                <td className="is-left">position only</td>
                <td className={started && a.cov < 0.8 ? 'bayes-warn' : undefined}>{cell(`${Math.round(a.cov * 100)} %`)}</td>
                <td>{cell(f2(a.rms))}</td>
                <td>{cell(f2(a.sd))}</td>
              </tr>
              <tr className={showAug ? 'is-best' : undefined}>
                <td className="is-left">{mode === 'random' ? 'position (+ nothing)' : `position + ${HIDDEN_SHORT[mode]}`}</td>
                <td className={started && b.cov < 0.8 ? 'bayes-warn' : undefined}>{cell(`${Math.round(b.cov * 100)} %`)}</td>
                <td>{cell(f2(b.rms))}</td>
                <td>{cell(f2(b.sd))}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <Rich
          className="small"
          text={
            !started
              ? 'Both filters see the **same** readings; only their state differs. Press Play (or step) and watch the two rows part company.'
              : mode === 'random'
                ? 'Both rows are the same filter: with memoryless noise the position already makes the future independent of the past, and the truth stays inside the 95 % set about 95 % of the time.'
                : `With the position alone the filter **claims** σ ≈ ${f2(a.sd)} cells but is really off by ${f2(a.rms)} (RMS): overconfident and wrong. With ${HIDDEN[mode]} in the state it uses the right model at every step and is consistent. You are watching the **${showAug ? `position + ${HIDDEN_SHORT[mode]}` : 'position only'}** filter (${Math.round(covNow * 100)} % inside so far).`
          }
        />
      </Panel>

      <Panel title="Predict, then check" className="bayes-predicts">
        <PredictReveal
          id="bayes-markov-heat"
          question="The sensor warms up and its noise grows from 1 to 7 cells, but the filter’s state is the position alone, so it keeps the cold-sensor model ($\sigma$ = 1 cell). After 60 steps, how does its belief compare with the truth?"
          options={['Wide, and centred on the truth', 'Narrow, and often missing the truth', 'Exactly as good as at the start']}
          answer={1}
          explain="The filter trusts every reading as if it were accurate to 1 cell, so the belief jumps to each noisy reading and stays narrow (claimed σ ≈ 0.6 cells) while the readings scatter by up to ±14 cells. The truth falls outside its 95 % set most of the time: **overconfident and wrong**. The noise depends on how long the sensor has run, history the state does not hold, so $p(z_t \mid x_t)$ is not the model the filter uses."
          tryIt="pick “Sensor heats up”, leave the toggle off and press Play."
          onApply={() => go('heat', false)}
        />
        <PredictReveal
          id="bayes-markov-fix"
          question="Now **add the temperature to the state**, so the filter uses $p(z_t \mid x_t, T_t)$ with the right noise at every step. What happens to its belief late in the run?"
          options={['It widens as the sensor gets worse, and the truth stays inside it', 'It stays just as narrow, but is now always right', 'It becomes uniform: hot readings are useless']}
          answer={0}
          explain="With $T_t$ in the state the model is right again: noisy readings get less weight, the motion model carries more of the load, and the belief honestly widens (claimed σ ≈ 1.5 cells). The truth stays inside the 95 % set about 95 % of the time and the actual error even **drops**, because the filter no longer chases noise. The state now contains everything that makes the future independent of the past."
          tryIt="switch on “Add temperature to the state” and replay."
          onApply={() => go('heat', true)}
        />
        <PredictReveal
          id="bayes-markov-random"
          question="Gusts push the robot and the wheels slip, **at random and independently** at every step. Does the position-only filter go wrong?"
          options={['Yes: the disturbances are not in the state', 'No: memoryless noise is already in the motion and sensor models', 'Only after the first gust']}
          answer={1}
          explain="Independent random disturbances do not carry any information from the past: the chance of a gust is the same whatever happened before, so the motion model $p(x_t \mid u_t, x_{t-1})$ (with enough noise) already describes them. The truth stays inside the 95 % set about 95 % of the time. The Markov assumption is about **memory**, not about noise."
          tryIt="pick “Random noise only” and press Play."
          onApply={() => go('random', false)}
        />
        <PredictReveal
          id="bayes-markov-motor"
          question="The motor wears out, so each command moves the robot less and less, but the position-only filter keeps the new-motor model. Where does its belief sit?"
          options={['Behind the robot', 'Ahead of the robot, by more and more', 'Exactly on the robot: the sensor fixes it']}
          answer={1}
          explain="Every prediction pushes the belief one full cell, while the robot moves less: the prior runs ahead and each reading only pulls it part of the way back, so the belief settles **ahead** of the truth, by several cells late in the run, while still claiming σ ≈ 1 cell. Adding motor health to the state (estimating the wear) makes the prediction right."
          tryIt="pick “Motor wears out”, toggle off, and press Play."
          onApply={() => go('motor', false)}
        />
      </Panel>
    </>
  );

  return (
    <div className="bayes-mk">
      <Cards onDemo={(m) => go(m, false)} />
      <BayesLayout
        left={left}
        right={right}
        below={
          <More label="The Markov assumption, formally">
            <Rich
              text={`The state $x_t$ is **complete** when it summarises all of the history:
$$p(x_t \\mid x_{0:t-1}, z_{1:t-1}, u_{1:t}) = p(x_t \\mid x_{t-1}, u_t), \\qquad p(z_t \\mid x_{0:t}, z_{1:t-1}, u_{1:t}) = p(z_t \\mid x_t).$$
Only then can the Bayes filter keep a single belief $bel(x_t)$ and forget the past. If something that changes over time and affects the motion or the readings (temperature, wear, a battery, people) is left out, the past still matters once $x_t$ is known, so the filter’s fixed models are wrong in a way that builds up. The cure is to **put that variable in the state** and estimate it too (summary notes §1; 2023 Q2, 2024 Q2, 2025 Q3).`}
            />
          </More>
        }
      />
    </div>
  );
}

// ------------------------------------------------------------------ the scenario cards

function Cards({ onDemo }: { onDemo: (m: MarkovMode) => void }) {
  const [picks, setPicks] = useState<Record<string, boolean>>({});
  const n = Object.keys(picks).length;
  const right = MARKOV_CARDS.filter((c) => c.id in picks && picks[c.id] === c.breaks).length;
  const choose = (id: string, breaks: boolean, truth: boolean) => {
    setPicks((p) => ({ ...p, [id]: breaks }));
    recordPrediction(`bayes-markov-card-${id}`, breaks === truth);
  };
  return (
    <section className="bayes-panel bayes-mk-cards-wrap">
      <div className="bayes-row bayes-mk-head">
        <h4>Sort the situations: fine, or does it break the Markov assumption?</h4>
        <span className="small muted" aria-live="polite">
          {n ? `${right} of ${n} right${n === MARKOV_CARDS.length ? ' (all sorted)' : ''}` : `${MARKOV_CARDS.length} to sort`}
        </span>
        {n > 0 && (
          <Button size="sm" variant="ghost" onClick={() => setPicks({})}>
            Start again
          </Button>
        )}
      </div>
      <div className="bayes-mk-cards">
        {MARKOV_CARDS.map((c) => {
          const picked = c.id in picks;
          const ok = picked && picks[c.id] === c.breaks;
          return (
            <div key={c.id} className={`bayes-mk-card ${picked ? (ok ? 'is-right' : 'is-wrong') : ''}`}>
              <div className="bayes-mk-title">{c.title}</div>
              <p className="small bayes-tight">{c.text}</p>
              {!picked ? (
                <div className="bayes-mk-btns">
                  <Button size="sm" onClick={() => choose(c.id, false, c.breaks)}>
                    Fine: Markov holds
                  </Button>
                  <Button size="sm" onClick={() => choose(c.id, true, c.breaks)}>
                    Breaks it
                  </Button>
                </div>
              ) : (
                <div className="bayes-mk-verdict">
                  <div className="bayes-mk-mark">
                    {ok ? '✓ Right: ' : '✗ No: '}
                    {c.breaks ? 'it breaks the Markov assumption' : 'the Markov assumption holds'}
                  </div>
                  <Rich className="small" text={c.why} />
                  <div className="bayes-row">
                    {c.demo && (
                      <Button size="sm" variant="ghost" onClick={() => onDemo(c.demo!)}>
                        Show me in the demo ↓
                      </Button>
                    )}
                    {c.source && <span className="small muted">{c.source}</span>}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {n === MARKOV_CARDS.length && (
        <Callout kind={right === n ? 'ok' : 'note'} title="The rule behind every card">
          <Rich text="Ask: **once I know the current state, does anything from the past still help predict the next state or reading?** Independent random noise does not (it has no memory). A quantity that drifts and is left out of the state (temperature, wear, charge, people in the scene) does, and the fix is always to add it to the state." />
        </Callout>
      )}
    </section>
  );
}
