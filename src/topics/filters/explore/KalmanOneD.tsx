// kf1d: the 1-D Kalman filter. One cycle drawn as four Gaussians on one axis (previous belief, prediction widened
// by R, the measurement likelihood of width Q, the posterior) with the gain K as a trust dial, and a time-series
// mode in which a cart drives along a rail with noisy motion and a noisy position sensor while K settles to its
// steady state. All filter arithmetic comes from core/filters_kalman.ts (through kfModel.ts).
import { useMemo, useRef, useState, type ReactNode } from 'react';
import type { ExploreItem } from '../../../engine/types';
import { Dot, HLine, Handle, Line, Plot, VLine, Area } from '../../../plot/Plot';
import { Button, Legend, More, Readout, Readouts, Segmented, Slider } from '../../../ui/kit';
import { StepControls, useStepper } from '../../../ui/stepper';
import { PredictReveal } from '../../../ui/PredictReveal';
import { Rich } from '../../../ui/Rich';
import { BandBetween, FiltersLayout, Panel, PlotArrow, clamp, easeInOut, f2, f3, gaussPoints, niceTop, revealVisual, useTween } from './common';
import { CYCLE_DEFAULT, TS_STEPS, cycle, gains, kfTrace, steady, sweep, tsNoise, type CycleIn } from './kfModel';

export const meta: Omit<ExploreItem, 'component'> = {
  id: 'kf1d',
  title: 'The 1-D Kalman filter: predict, measure, update',
  summary:
    'Four Gaussians on one axis: the previous belief, the prediction (shifted by $u$, widened by $R$), the measurement likelihood around $z$ (width set by $Q$) and the posterior. The gain $K$ is the trust dial between prediction and measurement. A time-series mode drives a cart along a rail and shows $K_t$ settling to its steady state.',
  notice:
    'The gain is $K = \\bar\\Sigma/(\\bar\\Sigma + Q)$, the prediction’s share of the total uncertainty: a noisier sensor (bigger $Q$) gives a smaller $K$, so the posterior stays nearer the prediction **and** comes out wider. Changing $Q$ moves both the mean and the variance.',
  minutes: 12,
};

const X_MIN = -2;
const X_MAX = 22;
type Mode = 'cycle' | 'time';
type Ghost = { mu: number; s2: number; label: string } | null;

const PHASES = [
  { value: 0, label: '1 · Last belief' },
  { value: 1, label: '2 · Predict' },
  { value: 2, label: '3 · Measure' },
  { value: 3, label: '4 · Update' },
];

const logLerp = (a: number, b: number, t: number) => a * Math.pow(b / a, t);

/** One eased segment per phase, so an animated cycle pauses briefly on each curve. */
const phaseEase = (p: number) => {
  const s = p * 3;
  const k = Math.min(2, Math.floor(s));
  return (k + easeInOut(s - k)) / 3;
};

export default function KalmanOneD() {
  const [mode, setModeRaw] = useState<Mode>('cycle');
  const [c, setC] = useState<CycleIn>(CYCLE_DEFAULT);
  const [ph, setPh] = useState(3);
  const [sweepP, setSweepP] = useState<'Q' | 'R'>('Q');
  const [seed, setSeed] = useState(4202);
  const [ghost, setGhost] = useState<Ghost>(null);
  /** The run's initial standard deviation (its own default, large, so K_t visibly settles). */
  const [s0ts, setS0ts] = useState(3);
  const leftRef = useRef<HTMLDivElement>(null);
  const tw = useTween();
  const st = useStepper(TS_STEPS, { speed: 8 });

  const res = useMemo(() => cycle(c), [c]);
  const ss = useMemo(() => steady(c.R, c.Q), [c.R, c.Q]);
  const noise = useMemo(() => tsNoise(seed), [seed]);
  const trace = useMemo(() => kfTrace(c.R, c.Q, s0ts, noise), [c.R, c.Q, s0ts, noise]);
  const gseq = useMemo(() => gains(c.R, c.Q, s0ts), [c.R, c.Q, s0ts]);

  /** A manual change: stop any animation, drop the "before" ghost. */
  const set = (k: keyof CycleIn, v: number) => {
    tw.finish();
    setGhost(null);
    setC((p) => ({ ...p, [k]: v }));
  };
  const setMode = (m: Mode) => {
    tw.finish();
    setModeRaw(m);
    if (m === 'cycle') st.pause();
  };

  /** Tween one parameter (log-spaced for variances), leaving a ghost of the posterior as it was. */
  const animate = (k: keyof CycleIn, to: number, ms = 1200, ghostLabel?: string) => {
    tw.finish();
    const from = c[k];
    const now = cycle(c);
    setModeRaw('cycle');
    setPh(3);
    setGhost(ghostLabel ? { mu: now.mu, s2: now.s2, label: ghostLabel } : null);
    const log = k === 'Q' || k === 'R';
    tw.run(ms, (p) => setC((prev) => ({ ...prev, [k]: log ? logLerp(from, to, p) : from + (to - from) * p })));
    revealVisual(leftRef.current);
  };

  const animateCycle = () => {
    setModeRaw('cycle');
    setGhost(null);
    tw.run(4200, (p) => setPh(p * 3), undefined, phaseEase);
    revealVisual(leftRef.current);
  };

  /** The 2024/2025 MCQ: sweep Q down, up and back with the sweep chart on Q. */
  const sweepQ = () => {
    tw.finish();
    const Q0 = c.Q;
    const now = cycle(c);
    setModeRaw('cycle');
    setPh(3);
    setSweepP('Q');
    setGhost({ mu: now.mu, s2: now.s2, label: `Q = ${f2(Q0)}` });
    tw.run(
      1300,
      (p) => setC((prev) => ({ ...prev, Q: logLerp(Q0, 0.1, p) })),
      () => tw.run(2600, (p) => setC((prev) => ({ ...prev, Q: logLerp(0.1, 10, p) })), () => tw.run(1300, (p) => setC((prev) => ({ ...prev, Q: logLerp(10, Q0, p) }))))
    );
    revealVisual(leftRef.current);
  };

  const playSeries = (s0?: number) => {
    tw.finish();
    setGhost(null);
    if (s0 !== undefined) setS0ts(s0);
    setModeRaw('time');
    st.reset();
    st.setSpeed(8);
    st.play();
    revealVisual(leftRef.current);
  };

  const timeMode = mode === 'time';
  const i = Math.min(st.i, TS_STEPS);
  const row = trace[i];
  const covered = trace.slice(1, i + 1).filter((r) => r.inside).length;

  // ---------------------------------------------------------------- left: the visual
  const left = (
    <div className="filters-panel filters-stack">
      <div className="filters-row is-between">
        <Segmented
          label="View"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'cycle', label: 'One cycle', title: 'One predict-correct cycle, curve by curve' },
            { value: 'time', label: 'Run over time', title: 'A cart on a rail: 60 cycles with noisy motion and measurements' },
          ]}
        />
        {timeMode ? (
          <Button size="sm" onClick={() => setSeed((s) => s + 1)} title="Draw a new set of motion and sensor noise">
            ↻ New noise
          </Button>
        ) : (
          <Button size="sm" variant="primary" onClick={animateCycle} title="Animate predict, measure and update in turn">
            ▶ Animate the cycle
          </Button>
        )}
      </div>
      {timeMode ? (
        <TimeView trace={trace} i={i} Kinf={ss.K} s2inf={ss.s2} gk={gseq.K} />
      ) : (
        <>
          <div className="filters-phases">
            <Segmented size="sm" label="Phase of the cycle" value={Math.min(3, Math.round(ph))} onChange={(v) => (tw.finish(), setPh(v))} options={PHASES} />
          </div>
          <CyclePlot c={c} ph={ph} ghost={ghost} onMu0={(v) => set('mu0', v)} onZ={(v) => set('z', v)} />
          <PhaseText c={c} ph={ph} />
          <div className="filters-dial-wrap">
            <KDial K={ph >= 2.999 ? res.K : NaN} />
            <GainShare s2Bar={res.s2Bar} Q={c.Q} K={res.K} innov={res.innov} />
          </div>
        </>
      )}
      {timeMode && <StepControls st={st} label="step" speeds={[2, 4, 8, 20]} />}
    </div>
  );

  // ---------------------------------------------------------------- right: controls, numbers, predictions
  const right = (
    <>
      <Panel title="Model">
        <div className="filters-sliders">
          <Slider label="actuation noise" tex="R" tip="Actuation (process) noise variance, m². Added in the prediction: Σ̄ = Σ + R." value={c.R} min={0.05} max={10} log unit="m²" onChange={(v) => set('R', v)} />
          <Slider label="sensor noise" tex="Q" tip="Sensor (measurement) noise variance, m². The width of p(z | x)." value={c.Q} min={0.05} max={10} log unit="m²" onChange={(v) => set('Q', v)} />
          {timeMode ? (
            <Slider
              label="initial std"
              tex="\sigma_0"
              tip="Standard deviation of the filter's first guess (m). A big σ₀ makes the first gain close to 1: the first reading is trusted almost completely."
              value={s0ts}
              min={0.2}
              max={6}
              step={0.05}
              unit="m"
              onChange={(v) => (tw.finish(), setS0ts(v))}
            />
          ) : (
            <Slider label="previous std" tex="\sigma_{t-1}" tip="Standard deviation of the belief before this cycle (m). Σ = σ²." value={c.s0} min={0.2} max={3} step={0.05} unit="m" onChange={(v) => set('s0', v)} />
          )}
          <Slider label="previous mean" tex="\mu_{t-1}" tip="Mean of the belief before this cycle (m). You can also drag the blue handle." value={c.mu0} min={0} max={14} step={0.1} unit="m" onChange={(v) => set('mu0', v)} disabled={timeMode} />
          <Slider label="command" tex="u" tip="Commanded displacement this step (m). The prediction shifts the belief by Bu = u." value={c.u} min={-6} max={8} step={0.1} unit="m" onChange={(v) => set('u', v)} disabled={timeMode} />
          <Slider label="measurement" tex="z" tip="The sensor reading (m). You can also drag the orange handle." value={c.z} min={0} max={20} step={0.1} unit="m" onChange={(v) => set('z', v)} disabled={timeMode} />
        </div>
        <Rich
          className="filters-note"
          text={
            timeMode
              ? 'In the run, $u_t$ is the cart’s known back-and-forth command and $z_t$ comes from the noisy sensor; the world uses the same $R$ and $Q$ as the filter. The cart starts at 10 m, the filter’s first guess is 7 m.'
              : 'Here $A = B = C = 1$: $x_t = x_{t-1} + u_t + \\varepsilon_t$ with $\\varepsilon_t \\sim \\mathcal N(0, R)$, and $z_t = x_t + \\delta_t$ with $\\delta_t \\sim \\mathcal N(0, Q)$.'
          }
        />
      </Panel>

      {timeMode ? (
        <Panel title={`Step ${i} of ${TS_STEPS}`} live>
          <Readouts min={104}>
            <Readout tex="u_t" value={i ? row.u : NaN} unit="m" tip="Known command this step" />
            <Readout tex="z_t" value={i ? row.z : NaN} unit="m" tip="Sensor reading this step" tone="m2" />
            <Readout tex="K_t" value={i ? row.K : NaN} sig={3} tip="Kalman gain this step" tone="m1" />
            <Readout tex="K_\infty" value={ss.K} sig={3} tip="Steady-state gain (closed form)" />
            <Readout tex="\sigma_t" value={Math.sqrt(row.s2)} unit="m" sig={3} tip="Posterior standard deviation" />
            <Readout label="error" value={row.x - row.mu} unit="m" sig={3} tip="True position minus the estimate" />
          </Readouts>
          <p className="filters-caption">
            Truth inside μ ± 2σ on <strong>{covered}</strong> of {i} steps{i ? ` (${Math.round((100 * covered) / i)} %; a well-tuned filter manages about 95 %)` : ''}.
          </p>
          <Rich
            className="filters-note"
            text={`The gain sequence never looks at the data: $K_t$ depends only on $R$, $Q$ and $\\sigma_0$. Each prediction adds $R$, each update removes a share, and the two balance at $\\bar\\Sigma_\\infty = \\tfrac{1}{2}\\big(R + \\sqrt{R^2 + 4RQ}\\big)$ = ${f2(ss.s2Bar)} m², so $K_\\infty = \\bar\\Sigma_\\infty/(\\bar\\Sigma_\\infty + Q)$ = **${f3(ss.K)}**.`}
          />
        </Panel>
      ) : (
        <>
          <Panel title="The numbers, as you would write them">
            <Worked c={c} />
          </Panel>
          <Panel
            title={`Change only ${sweepP}: what moves?`}
            aside={
              <Segmented
                size="sm"
                label="Parameter to sweep"
                value={sweepP}
                onChange={setSweepP}
                options={[
                  { value: 'Q', label: 'Q' },
                  { value: 'R', label: 'R' },
                ]}
              />
            }
          >
            <SweepCharts c={c} p={sweepP} />
          </Panel>
        </>
      )}

      <Panel title="Predict, then check" className="filters-predicts">
        <PredictReveal
          id="filters-kf1d-q-up"
          question="Make the sensor four times noisier ($Q \to 4Q$). Does $K$ go up or down, and does the posterior move more or less towards $z$?"
          options={['$K$ goes down; the posterior stays nearer the prediction $\\bar\\mu$', '$K$ goes up; the posterior moves closer to $z$', '$K$ is unchanged; only the posterior variance changes', '$K$ goes down, but the posterior mean still lands on $z$']}
          answer={0}
          explain={`$K = \\bar\\Sigma/(\\bar\\Sigma + Q)$: a bigger $Q$ makes the denominator bigger, so $K$ falls (here from ${f3(res.K)} to ${f3(cycle({ ...c, Q: Math.min(10, 4 * c.Q) }).K)}). The correction $K(z - \\bar\\mu)$ shrinks, so the mean stays nearer the prediction, and $\\Sigma = (1 - K)\\bar\\Sigma$ grows: a noisy reading teaches the filter less. The dashed blue curve is the posterior before the change.`}
          tryIt="drag $Q$ up and watch the dial and the blue posterior."
          onApply={() => animate('Q', Math.min(10, 4 * c.Q), 1300, 'before')}
        />
        <PredictReveal
          id="filters-kf1d-mcq-q"
          question="Exam MCQ (2024 Q5, 2025 Q5): you change only the noise in the **sensor** model. What happens to the Kalman filter’s estimate?"
          options={['There is no change in the estimate', 'Only the mean of the estimate changes', 'Only the variance of the estimate changes', 'Both the mean and the variance change']}
          answer={3}
          fixedOrder
          explain="$Q$ sits inside the gain $K = \bar\Sigma C^T(C\bar\Sigma C^T + Q)^{-1}$, and $K$ appears in **both** update equations: the mean $\mu = \bar\mu + K(z - C\bar\mu)$ and the covariance $\Sigma = (I - KC)\bar\Sigma$. Watch the sweep chart: as $Q$ goes from tiny to large the posterior mean slides from $z$ to $\bar\mu$ and the variance climbs from 0 to $\bar\Sigma$. (The one exception: if $z = \bar\mu$ exactly, the mean has nothing to correct.)"
          tryIt="sweep $Q$ with the slider and watch both charts under “Change only Q”."
          onApply={sweepQ}
        />
        <PredictReveal
          id="filters-kf1d-r-up"
          question="Now make the **motion** noisier instead ($R \to 4R$). What happens?"
          options={['The prediction widens and $K$ rises, so the update leans towards $z$', 'The prediction widens and $K$ falls', 'Only the posterior gets narrower', 'Nothing changes until the next measurement arrives']}
          answer={0}
          explain={`$R$ is added in the prediction, $\\bar\\Sigma = \\Sigma + R$, so the purple curve widens. A wider prediction is a bigger share of $\\bar\\Sigma + Q$, so $K$ rises (${f3(res.K)} → ${f3(cycle({ ...c, R: Math.min(10, 4 * c.R) }).K)}) and the filter trusts the measurement more. Uncertain motion means lean on the sensor; an uncertain sensor means lean on the motion model.`}
          tryIt="drag $R$ up and watch the purple prediction and the dial."
          onApply={() => animate('R', Math.min(10, 4 * c.R), 1300, 'before')}
        />
        <PredictReveal
          id="filters-kf1d-outlier"
          question="A surprising reading: drag $z$ far from the prediction. What happens to the posterior **variance** $\Sigma$?"
          options={['It grows, because the reading disagrees with the prediction', 'It shrinks more, because the reading carries more information', 'It does not change at all', 'It becomes zero']}
          answer={2}
          explain={`$\\Sigma = (1 - K)\\bar\\Sigma$ and $K = \\bar\\Sigma/(\\bar\\Sigma + Q)$ contain no $z$: the variance after the update is ${f2(res.s2)} m² wherever the reading lands. Only the mean moves (by $K$ times the innovation). A Kalman filter cannot tell a surprising reading from a normal one, which is why a single outlier can drag it off course; a discrete Bayes filter, by contrast, can become *less* certain after a surprising reading.`}
          tryIt="drag the orange handle across the plot and watch Σ in the numbers."
          onApply={() => animate('z', res.muBar > 10 ? 0.5 : 19.5, 1500)}
        />
        <PredictReveal
          id="filters-kf1d-steady"
          question="Run the cart for 60 steps. What does the gain $K_t$ do?"
          options={['It keeps falling towards 0 as measurements pile up', 'It settles to a constant $K_\\infty$ between 0 and 1', 'It jumps up and down with each measurement', 'It rises towards 1']}
          answer={1}
          explain={`Every prediction adds $R$ back, so the variance can never shrink to zero: the filter keeps trusting new readings by a fixed amount. $K_t$ settles within a few steps to $K_\\infty$ = ${f3(ss.K)} for these $R$ and $Q$, whatever the readings are (the gains can even be computed before the robot moves). Only if $R = 0$ (a robot that never moves unpredictably) does $K_t \\to 0$.`}
          tryIt="switch to “Run over time” and press Play; watch the gain chart."
          onApply={() => playSeries()}
        />
      </Panel>

      <More label="The general (matrix) form and why the update shrinks the variance">
        <Rich
          text={`The course writes the filter for any linear-Gaussian system: $$\\bar\\mu_t = A\\mu_{t-1} + Bu_t,\\qquad \\bar\\Sigma_t = A\\Sigma_{t-1}A^T + R$$ $$K_t = \\bar\\Sigma_t C^T\\big(C\\bar\\Sigma_t C^T + Q\\big)^{-1},\\quad \\mu_t = \\bar\\mu_t + K_t(z_t - C\\bar\\mu_t),\\quad \\Sigma_t = (I - K_tC)\\bar\\Sigma_t$$ With $A = B = C = 1$ these are the scalar lines in the numbers panel. The update is Bayes’ rule for two Gaussians: multiplying the prediction by the likelihood adds their **precisions**, $$\\frac{1}{\\Sigma_t} = \\frac{1}{\\bar\\Sigma_t} + \\frac{1}{Q},$$ so the posterior is narrower than **both** the prediction and the measurement (here ${f2(res.s2)} m² < ${f2(Math.min(res.s2Bar, c.Q))} m²). **R** is the actuation (process) noise and **Q** the sensor (measurement) noise in this course; other textbooks swap the letters.`}
        />
      </More>
    </>
  );

  return <FiltersLayout left={left} right={right} leftRef={leftRef} />;
}

// ------------------------------------------------------------------ one cycle: the four Gaussians

function CyclePlot({ c, ph, ghost, onMu0, onZ }: { c: CycleIn; ph: number; ghost: Ghost; onMu0: (v: number) => void; onZ: (v: number) => void }) {
  const r = useMemo(() => cycle(c), [c]);
  const s2p = c.s0 * c.s0;
  const a = clamp(ph, 0, 1);
  const b = clamp(ph - 1, 0, 1);
  const k = clamp(ph - 2, 0, 1);
  // Morphing curves: the prediction slides from the old belief, the posterior grows out of the prediction.
  const predMu = c.mu0 + a * c.u;
  const predS2 = s2p + a * c.R;
  const postMu = r.muBar + k * (r.mu - r.muBar);
  const postS2 = r.s2Bar + k * (r.s2 - r.s2Bar);
  const prior = useMemo(() => gaussPoints(c.mu0, s2p, X_MIN, X_MAX), [c.mu0, s2p]);
  const pred = useMemo(() => gaussPoints(predMu, predS2, X_MIN, X_MAX), [predMu, predS2]);
  const lik = useMemo(() => gaussPoints(c.z, c.Q, X_MIN, X_MAX), [c.z, c.Q]);
  const post = useMemo(() => gaussPoints(postMu, postS2, X_MIN, X_MAX), [postMu, postS2]);
  const gh = useMemo(() => (ghost ? gaussPoints(ghost.mu, ghost.s2, X_MIN, X_MAX) : null), [ghost]);
  const peak = (s2: number) => 1 / Math.sqrt(2 * Math.PI * s2);
  const yTop = niceTop(1.1 * Math.max(peak(s2p), ph > 0 ? peak(predS2) : 0, ph > 1 ? peak(c.Q) : 0, ph > 2 ? peak(postS2) : 0, ghost ? peak(ghost.s2) : 0));
  const priorIsBelief = ph < 0.001;
  const yArrow = yTop * 0.9;
  return (
    <div>
      <Plot x={{ min: X_MIN, max: X_MAX, label: 'position x (m)' }} y={{ min: 0, max: yTop, label: 'density (1/m)' }} height={300} ariaLabel={`Kalman filter cycle. Prediction mean ${f2(r.muBar)} m, measurement ${f2(c.z)} m, posterior mean ${f2(r.mu)} m.`}>
        {gh && <Line points={gh} color="var(--m1)" width={1.6} dash="3 4" opacity={0.75} />}
        <Line points={prior} color={priorIsBelief ? 'var(--m1)' : 'var(--text-3)'} width={priorIsBelief ? 2.6 : 1.8} dash={priorIsBelief ? undefined : '5 4'} />
        {priorIsBelief && <Area points={prior} color="var(--m1)" opacity={0.14} />}
        {ph > 0 && (
          <>
            <Area points={pred} color="var(--pred)" opacity={0.08} />
            <Line points={pred} color="var(--pred)" width={2.4} dash="7 4" />
            {Math.abs(c.u) > 0.3 && <PlotArrow x0={c.mu0} y0={yArrow} x1={predMu} y1={yArrow} color="var(--pred)" />}
          </>
        )}
        {ph > 1 && <Line points={lik} color="var(--m2)" width={2.4} opacity={b} />}
        {ph > 2 && (
          <>
            <Area points={post} color="var(--m1)" opacity={0.18 * k} />
            <Line points={post} color="var(--m1)" width={2.8} opacity={Math.max(0.25, k)} />
          </>
        )}
        {ph > 0 && <VLine x={r.muBar} color="var(--pred)" dash="2 3" label="μ̄" />}
        {ph > 2.999 && <VLine x={r.mu} color="var(--m1)" dash="2 3" label="μ" labelY="bottom" />}
        <Handle x={c.mu0} y={peak(s2p)} axis="x" color="var(--m1)" label={priorIsBelief ? 'μ' : 'μₜ₋₁'} ariaLabel="Previous mean (drag left or right)" clampX={[0, 14]} onChange={(x) => onMu0(Math.round(x * 10) / 10)} />
        {ph > 1 && <Handle x={c.z} y={peak(c.Q)} axis="x" color="var(--m2)" label="z" ariaLabel="Measurement z (drag left or right)" clampX={[0, 20]} onChange={(x) => onZ(Math.round(x * 10) / 10)} />}
        {ph > 2.999 && <Dot x={r.mu} y={peak(r.s2)} color="var(--m1)" r={4} />}
      </Plot>
      <Legend
        items={[
          { label: priorIsBelief ? 'belief bel(xₜ₋₁)' : 'previous belief', color: priorIsBelief ? 'var(--m1)' : 'var(--text-3)', dash: !priorIsBelief },
          { label: 'prediction bel̄(xₜ)', color: 'var(--pred)', dash: true },
          { label: 'likelihood p(z | x)', color: 'var(--m2)' },
          { label: 'posterior bel(xₜ)', color: 'var(--m1)' },
          ...(ghost ? [{ label: `posterior ${ghost.label}`, color: 'var(--m1)', dash: '3 4' }] : []),
        ]}
      />
    </div>
  );
}

function PhaseText({ c, ph }: { c: CycleIn; ph: number }) {
  const r = cycle(c);
  const s2p = c.s0 * c.s0;
  const p = Math.min(3, Math.floor(ph + 1e-6));
  const text = [
    `**Last belief** $bel(x_{t-1}) = \\mathcal N(\\mu_{t-1}, \\Sigma_{t-1})$ with $\\mu_{t-1}$ = ${f2(c.mu0)} m and $\\Sigma_{t-1}$ = ${f2(s2p)} m². Drag the blue handle to move it.`,
    `**Predict** with the command $u$ = ${f2(c.u)} m: the belief shifts by $u$ and widens by $R$, giving $\\bar\\mu$ = ${f2(r.muBar)} m and $\\bar\\Sigma = \\Sigma_{t-1} + R$ = ${f2(r.s2Bar)} m². Moving only ever adds uncertainty.`,
    `**Measure**: the sensor reads $z$ = ${f2(c.z)} m. Seen as a function of $x$, the likelihood $p(z \\mid x)$ is a Gaussian of variance $Q$ = ${f2(c.Q)} m² centred on $z$.`,
    `**Update**: multiply prediction and likelihood, then normalise. $K$ = ${f3(r.K)}, so the mean moves ${Math.round(r.K * 100)} % of the way from $\\bar\\mu$ to $z$ (to ${f2(r.mu)} m), and $\\Sigma = (1 - K)\\bar\\Sigma$ = ${f2(r.s2)} m², narrower than both the prediction and the reading.`,
  ][p];
  return <Rich className="filters-note" text={text} />;
}

// ------------------------------------------------------------------ the trust dial and the share bar

/** Semicircular gauge: K = 0 (left) trusts the prediction, K = 1 (right) trusts the measurement. */
function KDial({ K, Kinf }: { K: number; Kinf?: number }) {
  const cx = 105;
  const cy = 90;
  const R0 = 76;
  const pt = (k: number, r: number) => [cx - r * Math.cos(Math.PI * k), cy - r * Math.sin(Math.PI * k)] as const;
  const arc = (k0: number, k1: number, r: number) => {
    const [x0, y0] = pt(k0, r);
    const [x1, y1] = pt(k1, r);
    return `M${x0.toFixed(1)} ${y0.toFixed(1)}A${r} ${r} 0 0 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`;
  };
  const shown = Number.isFinite(K);
  const [nx, ny] = pt(shown ? K : 0.5, 62);
  return (
    <svg className="filters-dial" viewBox="0 0 210 140" role="img" aria-label={shown ? `Kalman gain K = ${f3(K)}: ${K < 0.5 ? 'leans on the prediction' : 'leans on the measurement'}` : 'Kalman gain: shown after the update'}>
      <path d={arc(0, 0.5, R0)} fill="none" stroke="var(--pred)" strokeWidth={12} opacity={0.55} />
      <path d={arc(0.5, 1, R0)} fill="none" stroke="var(--m2)" strokeWidth={12} opacity={0.55} />
      {[0, 0.25, 0.5, 0.75, 1].map((k) => {
        const [x0, y0] = pt(k, R0 - 9);
        const [x1, y1] = pt(k, R0 + 9);
        return <line key={k} x1={x0} y1={y0} x2={x1} y2={y1} stroke="var(--surface)" strokeWidth={2} />;
      })}
      {Kinf !== undefined && Number.isFinite(Kinf) && (() => {
        const [x, y] = pt(Kinf, R0 + 11);
        return <circle cx={x} cy={y} r={3.5} fill="var(--text-2)" />;
      })()}
      <text className="filters-dial-text" x={cx - R0} y={cy + 20} textAnchor="middle" fill="var(--pred)">
        trust μ̄
      </text>
      <text className="filters-dial-text" x={cx + R0} y={cy + 20} textAnchor="middle" fill="var(--m2)">
        trust z
      </text>
      {shown && (
        <>
          <line x1={cx} y1={cy} x2={nx} y2={ny} stroke="var(--text)" strokeWidth={3} strokeLinecap="round" />
          <circle cx={cx} cy={cy} r={6} fill="var(--text)" />
        </>
      )}
      <text className="filters-dial-k" x={cx} y={cy + 40} textAnchor="middle">
        {shown ? `K = ${f3(K)}` : 'K = ?'}
      </text>
    </svg>
  );
}

function GainShare({ s2Bar, Q, K, innov }: { s2Bar: number; Q: number; K: number; innov: number }) {
  return (
    <div className="filters-stack">
      <div className="filters-label">K is the prediction’s share of the uncertainty</div>
      <div className="filters-gainbar" role="img" aria-label={`Σ̄ ${f2(s2Bar)} against Q ${f2(Q)}`}>
        <div style={{ flexGrow: s2Bar, background: 'var(--pred)' }}>Σ̄ {f2(s2Bar)}</div>
        <div style={{ flexGrow: Q, background: 'var(--m2)' }}>Q {f2(Q)}</div>
      </div>
      <Rich className="filters-note" text={`$K = \\dfrac{\\bar\\Sigma}{\\bar\\Sigma + Q} = \\dfrac{${f2(s2Bar)}}{${f2(s2Bar)} + ${f2(Q)}} = ${f3(K)}$. The mean moves $K(z - \\bar\\mu)$ = ${f3(K)} × ${f2(innov)} = **${f2(K * innov)} m** towards the reading.`} />
    </div>
  );
}

// ------------------------------------------------------------------ the worked numbers

function Worked({ c }: { c: CycleIn }) {
  const r = cycle(c);
  const s2p = c.s0 * c.s0;
  const lines = [
    `$$\\bar\\mu = \\mu_{t-1} + u = ${f2(c.mu0)} ${c.u < 0 ? '-' : '+'} ${f2(Math.abs(c.u))} = ${f2(r.muBar)}\\ \\text{m}$$`,
    `$$\\bar\\Sigma = \\Sigma_{t-1} + R = ${f2(s2p)} + ${f2(c.R)} = ${f2(r.s2Bar)}\\ \\text{m}^2$$`,
    `$$K = \\frac{\\bar\\Sigma}{\\bar\\Sigma + Q} = \\frac{${f2(r.s2Bar)}}{${f2(r.s2Bar)} + ${f2(c.Q)}} = ${f3(r.K)}$$`,
    `$$\\mu = \\bar\\mu + K(z - \\bar\\mu) = ${f2(r.muBar)} + ${f3(r.K)}\\,(${f2(c.z)} - ${f2(r.muBar)}) = ${f2(r.mu)}\\ \\text{m}$$`,
    `$$\\Sigma = (1 - K)\\,\\bar\\Sigma = (1 - ${f3(r.K)}) \\times ${f2(r.s2Bar)} = ${f2(r.s2)}\\ \\text{m}^2$$`,
  ];
  return (
    <div className="filters-work">
      {lines.map((l, k) => (
        <Rich key={k} text={l} />
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ sweep: the posterior as a function of Q or R

const SWEEP_N = 120;
const SWEEP_MIN = 0.05;
const SWEEP_MAX = 10;

function SweepCharts({ c, p }: { c: CycleIn; p: 'Q' | 'R' }) {
  const xs = useMemo(() => {
    const a = new Float64Array(SWEEP_N + 1);
    for (let i = 0; i <= SWEEP_N; i++) a[i] = SWEEP_MIN * Math.pow(SWEEP_MAX / SWEEP_MIN, i / SWEEP_N);
    return a;
  }, []);
  const sw = useMemo(() => sweep(c, p, xs), [c.mu0, c.s0, c.u, c.z, p === 'Q' ? c.R : c.Q, p, xs]); // eslint-disable-line react-hooks/exhaustive-deps
  const r = cycle(c);
  const cur = c[p];
  const muLo = Math.min(...sw.mu, c.z, r.muBar);
  const muHi = Math.max(...sw.mu, c.z, r.muBar);
  const pad = Math.max(0.5, (muHi - muLo) * 0.12);
  const s2Hi = niceTop(Math.max(...sw.s2) * 1.1);
  const fmtX = (v: number) => (v >= 1 ? String(Math.round(v)) : String(v));
  const xAxis = { min: SWEEP_MIN, max: SWEEP_MAX, log: true, label: `${p} (m²)`, ticks: [0.1, 1, 10], format: fmtX };
  return (
    <>
      <div className="filters-two">
        <div>
          <div className="filters-label">posterior mean μ</div>
          <Plot x={xAxis} y={{ min: muLo - pad, max: muHi + pad }} height={150} margin={{ l: 40, r: 8 }} ariaLabel={`Posterior mean as ${p} varies`}>
            <HLine y={c.z} color="var(--m2)" label="z" />
            <HLine y={r.muBar} color="var(--pred)" label="μ̄" />
            <Line points={{ x: xs, y: sw.mu }} color="var(--m1)" width={2.4} />
            <VLine x={cur} color="var(--accent)" dash={false} />
            <Dot x={cur} y={r.mu} color="var(--m1)" />
          </Plot>
        </div>
        <div>
          <div className="filters-label">posterior variance Σ</div>
          <Plot x={xAxis} y={{ min: 0, max: s2Hi }} height={150} margin={{ l: 40, r: 8 }} ariaLabel={`Posterior variance as ${p} varies`}>
            {p === 'Q' && <HLine y={r.s2Bar} color="var(--pred)" label="Σ̄" />}
            <Line points={{ x: xs, y: sw.s2 }} color="var(--m1)" width={2.4} />
            <VLine x={cur} color="var(--accent)" dash={false} />
            <Dot x={cur} y={r.s2} color="var(--m1)" />
          </Plot>
        </div>
      </div>
      <Rich
        className="filters-note"
        text={
          p === 'Q'
            ? 'Small $Q$ (a precise sensor): $K \\to 1$, the mean jumps onto $z$ and the variance goes to 0. Large $Q$: $K \\to 0$, the mean stays at $\\bar\\mu$ and the variance stays at $\\bar\\Sigma$. Both curves move, so **both** the mean and the variance depend on $Q$.'
            : 'Small $R$ (precise motion): the prediction is sharp and the reading moves it less. Large $R$: the prediction is vague, $K \\to 1$ and the posterior follows $z$. The posterior variance can never exceed $Q$.'
        }
      />
    </>
  );
}

// ------------------------------------------------------------------ time series

function TimeView({ trace, i, Kinf, s2inf, gk }: { trace: ReturnType<typeof kfTrace>; i: number; Kinf: number; s2inf: number; gk: number[] }) {
  const shown = trace.slice(0, i + 1);
  const ts = shown.map((r) => r.t);
  const mu = shown.map((r) => r.mu);
  const lo = shown.map((r) => r.mu - 2 * Math.sqrt(r.s2));
  const hi = shown.map((r) => r.mu + 2 * Math.sqrt(r.s2));
  const truth = shown.map((r) => [r.t, r.x] as const);
  const kPts = gk.slice(0, i).map((k, j) => [j + 1, k] as const);
  const sPts = shown.map((r) => [r.t, Math.sqrt(r.s2)] as const);
  const row = trace[i];
  const sMax = niceTop(Math.max(...trace.map((r) => Math.sqrt(r.s2))) * 1.1);
  return (
    <>
      <Rail row={row} />
      <Plot x={{ min: 0, max: TS_STEPS, label: 'time step t' }} y={{ min: -1, max: 21, label: 'position (m)' }} height={220} ariaLabel={`Cart position and Kalman estimate after ${i} steps`}>
        <BandBetween xs={ts} lo={lo} hi={hi} />
        <Line points={truth} color="var(--text)" width={2} />
        <Line points={{ x: ts, y: mu }} color="var(--m1)" width={2.4} />
        {shown.slice(1).map((r) => (
          <Dot key={r.t} x={r.t} y={r.z} r={2.6} color="var(--m2)" />
        ))}
        {i > 0 && <VLine x={i} color="var(--accent)" dash="2 3" />}
      </Plot>
      <Legend
        items={[
          { label: 'true position', color: 'var(--text)' },
          { label: 'measurements zₜ', color: 'var(--m2)' },
          { label: 'estimate μₜ (band ±2σ)', color: 'var(--m1)' },
        ]}
      />
      <div className="filters-two">
        <div>
          <div className="filters-label">gain Kₜ</div>
          <Plot x={{ min: 0, max: TS_STEPS }} y={{ min: 0, max: 1 }} height={130} margin={{ l: 36, r: 8 }} ariaLabel="Kalman gain over time">
            <HLine y={Kinf} color="var(--text-2)" label={`K∞ = ${f3(Kinf)}`} />
            <Line points={kPts} color="var(--m1)" width={2.2} />
            {i > 0 && <Dot x={i} y={gk[i - 1]} color="var(--m1)" r={3.5} />}
          </Plot>
        </div>
        <div>
          <div className="filters-label">posterior std σₜ (m)</div>
          <Plot x={{ min: 0, max: TS_STEPS }} y={{ min: 0, max: sMax }} height={130} margin={{ l: 36, r: 8 }} ariaLabel="Posterior standard deviation over time">
            <HLine y={Math.sqrt(s2inf)} color="var(--text-2)" label={`σ∞ = ${f2(Math.sqrt(s2inf))}`} />
            <Line points={sPts} color="var(--m1)" width={2.2} />
            <Dot x={i} y={Math.sqrt(row.s2)} color="var(--m1)" r={3.5} />
          </Plot>
        </div>
      </div>
    </>
  );
}

/** The cart on its 20 m rail: true position, the latest reading and the estimate with its ±2σ bar. */
function Rail({ row }: { row: ReturnType<typeof kfTrace>[number] }) {
  const X0 = 26;
  const X1 = 614;
  const px = (x: number) => X0 + ((clamp(x, -1, 21) + 1) / 22) * (X1 - X0);
  const y = 58;
  const s = Math.sqrt(row.s2);
  const ticks: ReactNode[] = [];
  for (let v = 0; v <= 20; v += 5)
    ticks.push(
      <g key={v}>
        <line x1={px(v)} x2={px(v)} y1={y + 8} y2={y + 13} stroke="var(--text-3)" />
        <text className="filters-rail-text" x={px(v)} y={y + 25} textAnchor="middle" fill="var(--text-3)">
          {v} m
        </text>
      </g>
    );
  const hasZ = Number.isFinite(row.z);
  return (
    <svg className="filters-rail" viewBox="0 0 640 92" role="img" aria-label={`Cart at ${f2(row.x)} m; estimate ${f2(row.mu)} m ± ${f2(2 * s)} m${hasZ ? `; reading ${f2(row.z)} m` : ''}`}>
      <line x1={X0} x2={X1} y1={y + 8} y2={y + 8} stroke="var(--text-3)" strokeWidth={3} strokeLinecap="round" />
      {ticks}
      <rect x={px(row.mu - 2 * s)} y={y - 30} width={Math.max(2, px(row.mu + 2 * s) - px(row.mu - 2 * s))} height={10} rx={5} fill="var(--m1)" opacity={0.25} />
      <circle cx={px(row.mu)} cy={y - 25} r={5} fill="var(--m1)" />
      <text className="filters-rail-text" x={px(row.mu)} y={y - 35} textAnchor="middle" fill="var(--m1)">
        μ ± 2σ
      </text>
      <g transform={`translate(${px(row.x)} ${y})`}>
        <rect x={-14} y={-12} width={28} height={14} rx={3} fill="var(--text)" />
        <circle cx={-8} cy={4} r={3.5} fill="var(--text)" />
        <circle cx={8} cy={4} r={3.5} fill="var(--text)" />
      </g>
      {hasZ && (
        <g transform={`translate(${px(row.z)} ${y - 14})`}>
          <path d="M-6 -8L6 -8L0 0Z" fill="var(--m2)" />
          <text className="filters-rail-text" x={9} y={-1} fill="var(--m2)">
            z
          </text>
        </g>
      )}
    </svg>
  );
}
