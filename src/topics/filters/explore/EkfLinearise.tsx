// ekf: where linearisation fails. Predict mode pushes a Gaussian through a nonlinear function: 20 000 Monte Carlo
// samples give the true transformed distribution (histogram), the EKF pushes it through the tangent line at the
// mean (Jacobian G) instead. Update mode corrects a belief with a range reading to a beacon beside the rail: the
// exact posterior can have two peaks, the EKF's linearised update keeps one Gaussian (or ignores the reading).
import { useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import type { ExploreItem } from '../../../engine/types';
import { Area, Dot, HLine, Line, Plot, VLine, usePlot } from '../../../plot/Plot';
import { Callout, Legend, More, Readout, Readouts, Segmented, Slider } from '../../../ui/kit';
import { PredictReveal } from '../../../ui/PredictReveal';
import { Rich } from '../../../ui/Rich';
import { useWidth } from '../../../anim/hooks';
import { FiltersLayout, Panel, clamp, f2, f3, niceTop, revealVisual, useTween } from './common';
import { FNS, RANGE_X, SIN_D, ekfMoments, mcHistogram, normals, probit, rangeUpdate, trueMoments, type FnId, type RangeIn } from './ekfModel';

export const meta: Omit<ExploreItem, 'component'> = {
  id: 'ekf',
  title: 'EKF: where linearisation fails',
  summary:
    'Push a Gaussian belief through a nonlinear model: 20 000 Monte Carlo samples show the true result, the EKF pushes it through the tangent line at the mean instead (Jacobian shown). Then correct a belief with a range reading whose true posterior has two peaks.',
  notice:
    'The EKF only ever sees the tangent at the mean: the wider the belief ($\\sigma$) and the more curved the model, the further its mean and spread drift from the truth, and when the true belief splits in two, one Gaussian cannot follow.',
  minutes: 10,
};

type Mode = 'predict' | 'update';
const N_MC = 20000;
const BINS = 64;
const N_RAYS = 25;

const FN_LABEL: Record<FnId, string> = { curve: 'Curved model', sin: 'Heading → sideways' };

export default function EkfLinearise() {
  const [mode, setModeRaw] = useState<Mode>('predict');
  const [fn, setFn] = useState<FnId>('curve');
  const [mu, setMu] = useState(-0.6);
  const [s, setS] = useState(1);
  const [k, setK] = useState(0.25);
  const [ru, setRu] = useState<RangeIn>({ mu: 1.2, s: 2.2, b: 1, z: 4, Q: 0.09 });
  const leftRef = useRef<HTMLDivElement>(null);
  const tw = useTween();
  const eps = useMemo(() => normals(N_MC), []);

  const F = FNS[fn];
  const ek = ekfMoments(fn, mu, s, k);
  const tm = trueMoments(fn, mu, s, k);
  const hist = useMemo(() => mcHistogram(fn, mu, s, k, eps, F.y[0], F.y[1], BINS), [fn, mu, s, k, eps, F]);
  const rr = useMemo(() => rangeUpdate(ru), [ru]);

  const setMode = (m: Mode) => {
    tw.finish();
    setModeRaw(m);
  };
  const pickFn = (f: FnId) => {
    tw.finish();
    setFn(f);
    if (f === 'sin') {
      setMu(0.6);
      setS(0.4);
    } else {
      setMu(-0.6);
      setS(1);
    }
  };
  const tweenTo = (from: number, to: number, set: (v: number) => void, ms = 1300) => tw.run(ms, (p) => set(from + (to - from) * p));
  const show = () => revealVisual(leftRef.current);

  const muRange: [number, number] = fn === 'curve' ? [-2, 2] : [-Math.PI, Math.PI];

  // ---------------------------------------------------------------- left: the visual
  const left = (
    <div className="filters-panel filters-stack">
      <div className="filters-row is-between">
        <Segmented
          label="What the EKF linearises"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'predict', label: 'Predict: push through g', title: 'Motion model: the belief through a nonlinear g' },
            { value: 'update', label: 'Update: a range reading', title: 'Measurement model: correct with a nonlinear h' },
          ]}
        />
        {mode === 'predict' && (
          <Segmented
            size="sm"
            label="Model"
            value={fn}
            onChange={pickFn}
            options={[
              { value: 'curve', label: FN_LABEL.curve, title: 'g(x) = x + κx²: curvature set by κ' },
              { value: 'sin', label: FN_LABEL.sin, title: 'g(θ) = d sin θ: sideways displacement after driving d = 2 m with heading θ' },
            ]}
          />
        )}
      </div>
      {mode === 'predict' ? (
        <>
          <Rich
            className="filters-note"
            text={
              fn === 'curve'
                ? `$y = g(x) = x + \\kappa x^2$ with $\\kappa$ = ${f2(k)}: a 1-D motion model whose curvature you set. Drag the input mean (bottom panel).`
                : `$y = g(\\theta) = d\\sin\\theta$ with $d$ = ${SIN_D} m: the sideways displacement after driving ${SIN_D} m with an uncertain heading $\\theta$ (rad).`
            }
          />
          <TransformFigure fn={fn} mu={mu} s={s} k={k} hist={hist} onMu={(v) => (tw.finish(), setMu(clamp(v, muRange[0], muRange[1])))} />
          <Legend
            items={[
              { label: fn === 'curve' ? 'model y = g(x)' : 'model y = d sin θ', color: 'var(--text)' },
              { label: 'EKF tangent at the mean', color: 'var(--m3)', dash: true },
              { label: 'samples pushed through g (truth)', color: 'var(--m1)' },
              { label: 'EKF Gaussian', color: 'var(--m3)' },
            ]}
          />
          <Rich
            className="filters-note"
            text={`**Truth** (20 000 samples): mean ${f2(hist.mean)}, std ${f2(hist.std)}. **EKF**: mean $g(\\mu)$ = ${f2(ek.mean)}, std $|G|\\sigma$ = ${f2(ek.std)}. Mean error **${f2(tm.mean - ek.mean)} m**, spread ${ek.std < tm.std ? 'underestimated' : 'overestimated'} by ${tm.std > 0 ? Math.round(Math.abs(1 - ek.std / tm.std) * 100) : 0} %.${hist.outside > 0.01 ? ` (${Math.round(hist.outside * 100)} % of the samples fall off the plot.)` : ''}`}
          />
        </>
      ) : (
        <>
          <Rich className="filters-note" text={`A robot on a rail measures its **range** to a beacon ${f2(ru.b)} m off the rail: $h(x) = \\sqrt{x^2 + b^2}$. Every point on the dashed circle is ${f2(ru.z)} m from the beacon, and the circle cuts the rail **twice**.`} />
          <RangeGeometry ru={ru} rr={rr} />
          <RangePlot ru={ru} rr={rr} />
          <Legend
            items={[
              { label: 'prediction bel̄(x)', color: 'var(--pred)', dash: true },
              { label: 'p(z | x), scaled', color: 'var(--m2)' },
              { label: 'EKF’s linearised p(z | x)', color: 'var(--m3)', dash: '3 3' },
              { label: 'true posterior', color: 'var(--m1)' },
              { label: 'EKF posterior', color: 'var(--m3)' },
            ]}
          />
        </>
      )}
    </div>
  );

  // ---------------------------------------------------------------- right: controls, readouts, predictions
  const right = (
    <>
      {mode === 'predict' ? (
        <Panel title="Input belief and model">
          <div className="filters-sliders">
            <Slider
              label="input mean"
              tex={fn === 'curve' ? '\\mu' : '\\mu_\\theta'}
              tip={fn === 'curve' ? 'Mean of the input belief (m). You can also drag the handle under the plot.' : 'Mean heading (rad). You can also drag the handle under the plot.'}
              value={mu}
              min={muRange[0]}
              max={muRange[1]}
              step={0.01}
              unit={fn === 'curve' ? 'm' : 'rad'}
              onChange={(v) => (tw.finish(), setMu(v))}
            />
            <Slider label="input std" tex={fn === 'curve' ? '\\sigma' : '\\sigma_\\theta'} tip="Standard deviation of the input belief: how much of the curve it covers." value={s} min={0.05} max={fn === 'curve' ? 1.6 : 1.8} step={0.01} unit={fn === 'curve' ? 'm' : 'rad'} onChange={(v) => (tw.finish(), setS(v))} />
            {fn === 'curve' && <Slider label="nonlinearity" tex="\kappa" tip="Curvature of g(x) = x + κx² (1/m). κ = 0 is a straight line." value={k} min={0} max={0.35} step={0.005} unit="1/m" onChange={(v) => (tw.finish(), setK(v))} />}
          </div>
          <Readouts min={112}>
            <Readout tex="G = g'(\mu)" value={ek.G} sig={3} tip="The Jacobian: slope of g at the mean. The EKF uses it in place of A." tone="m3" />
            <Readout label="EKF mean" value={ek.mean} unit="m" sig={3} tip="g(μ): the mean pushed through g" tone="m3" />
            <Readout label="true mean" value={tm.mean} unit="m" sig={3} tip="Exact mean of g(x) (the histogram's mean)" tone="m1" />
            <Readout label="EKF std" value={ek.std} unit="m" sig={3} tip="|G| σ" tone="m3" />
            <Readout label="true std" value={tm.std} unit="m" sig={3} tip="Exact standard deviation of g(x)" tone="m1" />
            <Readout label="mean error" value={tm.mean - ek.mean} unit="m" sig={3} tip="True mean minus the EKF mean (the EKF's bias)" />
          </Readouts>
          {fn === 'curve' ? (
            <Rich className="filters-note" text={`For this model the errors are exact: bias $= \\kappa\\sigma^2$ = ${f3(k * s * s)} m, and the EKF misses $2\\kappa^2\\sigma^4$ = ${f3(2 * k * k * s ** 4)} m² of variance. Both vanish when $\\kappa = 0$ and grow fast with $\\sigma$.`} />
          ) : (
            <Rich className="filters-note" text={`Here $G = d\\cos\\mu_\\theta$ = ${f2(ek.G)} m/rad. Near $\\theta = 90°$ the tangent is flat, so the EKF predicts almost no spread, while the true spread is ${f2(tm.std)} m.`} />
          )}
        </Panel>
      ) : (
        <Panel title="Prediction and reading">
          <div className="filters-sliders">
            <Slider label="predicted mean" tex="\bar\mu" tip="Mean of the predicted belief on the rail (m)." value={ru.mu} min={-5} max={5} step={0.05} unit="m" onChange={(v) => (tw.finish(), setRu((p) => ({ ...p, mu: v })))} />
            <Slider label="predicted std" tex="\bar\sigma" tip="Standard deviation of the predicted belief (m)." value={ru.s} min={0.3} max={4} step={0.05} unit="m" onChange={(v) => (tw.finish(), setRu((p) => ({ ...p, s: v })))} />
            <Slider label="range reading" tex="z" tip="Measured distance to the beacon (m)." value={ru.z} min={0.2} max={7} step={0.05} unit="m" onChange={(v) => (tw.finish(), setRu((p) => ({ ...p, z: v })))} />
            <Slider label="beacon offset" tex="b" tip="Distance of the beacon from the rail (m). Smaller b = sharper V in h(x) near x = 0." value={ru.b} min={0.2} max={3} step={0.05} unit="m" onChange={(v) => (tw.finish(), setRu((p) => ({ ...p, b: v })))} />
            <Slider label="sensor noise" tex="Q" tip="Range noise variance (m²)." value={ru.Q} min={0.01} max={1} log unit="m²" onChange={(v) => (tw.finish(), setRu((p) => ({ ...p, Q: v })))} />
          </div>
          <Readouts min={112}>
            <Readout tex="H = h'(\bar\mu)" value={rr.H} sig={3} tip="Jacobian of the range at the predicted mean" tone="m3" />
            <Readout tex="K" value={rr.K} sig={3} tip="EKF gain: metres of position per metre of range error" tone="m3" />
            <Readout label="EKF mean" value={rr.ekfMu} unit="m" sig={3} tone="m3" />
            <Readout label="EKF std" value={Math.sqrt(rr.ekfS2)} unit="m" sig={3} tone="m3" />
            <Readout label="true mean" value={rr.truthMean} unit="m" sig={3} tone="m1" tip="Mean of the exact posterior (between the peaks if there are two)" />
            <Readout label="true peaks" text={rr.modes.length ? rr.modes.map((x) => x.toFixed(2)).join(', ') : '—'} tip="Positions of the exact posterior's peaks (m)" tone="m1" />
          </Readouts>
          <RangeVerdict rr={rr} ru={ru} />
        </Panel>
      )}

      {mode === 'predict' && (
        <Panel title="How the error grows with the input spread">
          <ErrorCharts fn={fn} mu={mu} s={s} k={k} />
        </Panel>
      )}

      <Panel title="Predict, then check" className="filters-predicts">
        <PredictReveal
          id="filters-ekf-sigma-bias"
          question="Model $g(x) = x + 0.2x^2$ with the input mean at 0.5 m. **Double** the input spread $\sigma$ from 0.5 m to 1.0 m. The EKF’s mean error becomes…"
          options={['the same (the tangent does not change)', 'twice as large', 'four times as large', 'smaller, because more samples average out']}
          answer={2}
          explain="The EKF reports $g(\mu)$, but the true mean is $E[g(x)] = g(\mu) + \kappa\sigma^2$: the curve bends away from the tangent on both sides, and the further the samples reach, the more it bends. The bias $\kappa\sigma^2$ grows with $\sigma^2$, so doubling $\sigma$ quadruples it (0.05 m → 0.20 m). The tangent (and so the EKF mean) does not move at all."
          tryIt="set κ = 0.2 and drag σ from 0.5 to 1.0; watch “mean error”."
          onApply={() => {
            setModeRaw('predict');
            setFn('curve');
            setK(0.2);
            setMu(0.5);
            setS(0.5);
            tweenTo(0.5, 1.0, setS, 1600);
            show();
          }}
        />
        <PredictReveal
          id="filters-ekf-linear"
          question="Now set the curvature to zero ($\kappa = 0$, a straight line). How does the EKF’s Gaussian compare with the Monte Carlo truth?"
          options={['They match exactly', 'The EKF is still biased', 'The EKF’s spread is too small', 'The truth is no longer Gaussian']}
          answer={0}
          explain="A straight line maps a Gaussian to a Gaussian, and the tangent **is** the line, so the linearisation loses nothing: the EKF reduces to the ordinary Kalman filter, which is exact for linear-Gaussian models. All the error in the other cases comes from the curvature the tangent ignores."
          tryIt="drag κ to 0 and compare the green Gaussian with the histogram."
          onApply={() => {
            setModeRaw('predict');
            if (fn !== 'curve') {
              setFn('curve');
              setMu(0.5);
              setS(0.8);
              setK(0.25);
              tweenTo(0.25, 0, setK, 1400);
            } else tweenTo(k, 0, setK, 1400);
            show();
          }}
        />
        <PredictReveal
          id="filters-ekf-flat"
          question={`Heading model, $d$ = ${SIN_D} m. The robot faces almost straight across ($\\mu_\\theta$ = 1.57 rad = 90°) with $\\sigma_\\theta$ = 0.5 rad. What spread does the EKF predict for the sideways displacement?`}
          options={['Almost none: the tangent is flat there', 'About the true spread', 'Far more than the true spread', 'It cannot linearise at 90°, so it stops']}
          answer={0}
          explain="$G = d\cos(90°) = 0$: the tangent is horizontal, so the EKF pushes the whole belief onto a single point (std $|G|\sigma \approx 0$) and is badly over-confident. The samples show the truth: every heading error makes the sideways displacement *shorter* than $d$, so the true distribution piles up just below 2 m with a long tail, and its mean is lower than $g(\mu)$."
          tryIt="pick “Heading → sideways” and drag the input mean to 1.57 rad."
          onApply={() => {
            setModeRaw('predict');
            setFn('sin');
            setS(0.5);
            tweenTo(fn === 'sin' ? mu : 0.6, Math.PI / 2, setMu, 1400);
            show();
          }}
        />
        <PredictReveal
          id="filters-ekf-heading-bimodal"
          question="Heading model again, now with the mean heading 0 and a **huge** heading spread, $\sigma_\theta$ = 1.5 rad. What does the true distribution of the sideways displacement look like?"
          options={['A wide Gaussian, like the EKF’s', 'A narrow peak at 0', 'Two peaks near $\\pm d$, with a dip in the middle', 'Flat between $-d$ and $+d$']}
          answer={2}
          explain="$d\sin\theta$ flattens out near $\theta = \pm 90°$, so many different headings land near $\pm d$ and the samples pile up there: the true belief is **bimodal**, with little mass in the middle. The EKF’s single Gaussian (std $d\sigma$ = 3 m) is centred on 0, where the robot is *least* likely to be, and spills past $\pm d$, where it cannot be."
          tryIt="pick “Heading → sideways”, set the mean to 0 and drag σ up to 1.5 rad."
          onApply={() => {
            setModeRaw('predict');
            setFn('sin');
            setMu(0);
            tweenTo(fn === 'sin' ? s : 0.4, 1.5, setS, 1600);
            show();
          }}
        />
        <PredictReveal
          id="filters-ekf-range-zero"
          question="Update mode: the prediction sits right beside the beacon ($\bar\mu$ = 0 m, $\bar\sigma$ = 2.2 m) and the range reads 4 m. What does the EKF do with that reading?"
          options={['Moves its mean to about +3.9 m', 'Moves its mean to about −3.9 m', 'Splits its belief into two peaks', 'Leaves the mean at 0: the Jacobian there is 0, so K = 0']}
          answer={3}
          explain="At $x = 0$ the range $\sqrt{x^2 + b^2}$ is at its minimum, so its slope $H = 0$ and the gain $K = \bar\Sigma H/(H^2\bar\Sigma + Q) = 0$: the linearised model says the reading carries no information about $x$, and the EKF ignores a reading that actually says “you are about 3.9 m from here, on one side or the other”. The exact posterior has two peaks; a Gaussian cannot."
          tryIt="switch to “Update: a range reading” and drag the predicted mean to 0."
          onApply={() => {
            setModeRaw('update');
            setRu((p) => ({ ...p, s: 2.2, z: 4, b: 1, Q: 0.09 }));
            tweenTo(ru.mu, 0, (v) => setRu((p) => ({ ...p, mu: v })), 1400);
            show();
          }}
        />
      </Panel>

      <More label="How the EKF linearises (the course’s equations)">
        <Rich
          text={`The EKF keeps the Kalman filter’s single Gaussian but allows nonlinear models $x_t = g(u_t, x_{t-1}) + \\varepsilon_t$ and $z_t = h(x_t) + \\delta_t$. It replaces each model by its first-order Taylor expansion **at the current mean**: $$g(u_t, x_{t-1}) \\approx g(u_t, \\mu_{t-1}) + G_t\\,(x_{t-1} - \\mu_{t-1}),\\qquad G_t = \\frac{\\partial g}{\\partial x}\\Big|_{\\mu_{t-1}}$$ $$\\bar\\mu_t = g(u_t, \\mu_{t-1}),\\quad \\bar\\Sigma_t = G_t\\Sigma_{t-1}G_t^T + R,\\quad K_t = \\bar\\Sigma_t H_t^T(H_t\\bar\\Sigma_t H_t^T + Q)^{-1}$$ $$\\mu_t = \\bar\\mu_t + K_t\\big(z_t - h(\\bar\\mu_t)\\big),\\quad \\Sigma_t = (I - K_tH_t)\\bar\\Sigma_t,\\qquad H_t = \\frac{\\partial h}{\\partial x}\\Big|_{\\bar\\mu_t}$$ The approximation is good when the model is close to straight **over the width of the belief**: mildly nonlinear models and small uncertainty (odometry with frequent GPS fixes). It fails when the belief is wide, the model strongly curved, or the true belief has several peaks; that is when a particle filter (no linearisation, any shape) is the better tool.`}
        />
      </More>
    </>
  );

  return <FiltersLayout left={left} right={right} leftRef={leftRef} />;
}

// ------------------------------------------------------------------ the three-panel transform figure

const VW = 680;
const VH = 500;
const OUT = { x0: 6, x1: 146 };
const MAIN = { x0: 190, x1: 672, y0: 10, y1: 318 };
const INP = { y0: 340, y1: 462 };

function TransformFigure({ fn, mu, s, k, hist, onMu }: { fn: FnId; mu: number; s: number; k: number; hist: { dens: Float64Array }; onMu: (v: number) => void }) {
  const F = FNS[fn];
  const svgRef = useRef<SVGSVGElement>(null);
  const dragging = useRef(false);
  const [x0, x1] = F.x;
  const [y0, y1] = F.y;
  const sx = (x: number) => MAIN.x0 + ((x - x0) / (x1 - x0)) * (MAIN.x1 - MAIN.x0);
  const sy = (y: number) => MAIN.y1 - ((y - y0) / (y1 - y0)) * (MAIN.y1 - MAIN.y0);
  const ek = ekfMoments(fn, mu, s, k);
  const tm = trueMoments(fn, mu, s, k);
  const binW = (y1 - y0) / hist.dens.length;
  const ekfPeak = ek.std > 1e-9 ? 1 / (ek.std * Math.sqrt(2 * Math.PI)) : Infinity;
  const histMax = Math.max(...hist.dens);
  const dMax = Math.max(histMax, Math.min(ekfPeak, histMax * 1.6)) * 1.08 || 1;
  const od = (d: number) => Math.max(OUT.x0, OUT.x1 - (d / dMax) * (OUT.x1 - OUT.x0));
  const inPeak = 1 / (s * Math.sqrt(2 * Math.PI));
  const id = (d: number) => INP.y1 - (d / (inPeak * 1.12)) * (INP.y1 - INP.y0);
  const clampY = (v: number) => Math.max(MAIN.y0 - 4, Math.min(MAIN.y1 + 4, v));

  // curve, tangent, densities
  let curve = '';
  for (let i = 0; i <= 240; i++) {
    const x = x0 + ((x1 - x0) * i) / 240;
    curve += `${i ? 'L' : 'M'}${sx(x).toFixed(1)} ${clampY(sy(F.g(x, k))).toFixed(1)}`;
  }
  const tangent = `M${sx(x0).toFixed(1)} ${clampY(sy(ek.mean + ek.G * (x0 - mu))).toFixed(1)}L${sx(x1).toFixed(1)} ${clampY(sy(ek.mean + ek.G * (x1 - mu))).toFixed(1)}`;
  let inD = `M${sx(x0).toFixed(1)} ${INP.y1}`;
  for (let i = 0; i <= 200; i++) {
    const x = x0 + ((x1 - x0) * i) / 200;
    const d = Math.exp(-((x - mu) ** 2) / (2 * s * s)) / (s * Math.sqrt(2 * Math.PI));
    inD += `L${sx(x).toFixed(1)} ${id(d).toFixed(1)}`;
  }
  inD += `L${sx(x1).toFixed(1)} ${INP.y1}Z`;
  let bars = '';
  hist.dens.forEach((d, b) => {
    if (d <= 0) return;
    const ya = sy(y0 + b * binW);
    const yb = sy(y0 + (b + 1) * binW);
    bars += `M${OUT.x1} ${yb.toFixed(1)}H${od(d).toFixed(1)}V${ya.toFixed(1)}H${OUT.x1}Z`;
  });
  let ekD = '';
  if (ek.std > 1e-6) {
    for (let i = 0; i <= 200; i++) {
      const y = y0 + ((y1 - y0) * i) / 200;
      const d = Math.exp(-((y - ek.mean) ** 2) / (2 * ek.std * ek.std)) / (ek.std * Math.sqrt(2 * Math.PI));
      ekD += `${i ? 'L' : 'M'}${od(d).toFixed(1)} ${sy(y).toFixed(1)}`;
    }
  }
  // rays: evenly spread quantiles of the input belief
  let raysV = '';
  let raysH = '';
  for (let q = 0; q < N_RAYS; q++) {
    const x = mu + s * probit((q + 0.5) / N_RAYS);
    if (x < x0 || x > x1) continue;
    const y = F.g(x, k);
    if (y < y0 || y > y1) continue;
    const px = sx(x).toFixed(1);
    const py = sy(y).toFixed(1);
    raysV += `M${px} ${INP.y0}V${py}`;
    raysH += `M${px} ${py}H${OUT.x1}`;
  }

  const fromClient = (clientX: number) => {
    const svg = svgRef.current;
    if (!svg) return mu;
    const r = svg.getBoundingClientRect();
    const vx = ((clientX - r.left) / r.width) * VW;
    return x0 + ((vx - MAIN.x0) / (MAIN.x1 - MAIN.x0)) * (x1 - x0);
  };
  const onDown = (e: PointerEvent<SVGRectElement>) => {
    dragging.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    onMu(fromClient(e.clientX));
  };
  const onMove = (e: PointerEvent<SVGRectElement>) => {
    if (dragging.current) onMu(fromClient(e.clientX));
  };
  const onUp = (e: PointerEvent<SVGRectElement>) => {
    dragging.current = false;
    e.currentTarget.releasePointerCapture(e.pointerId);
  };
  const onKey = (e: KeyboardEvent<SVGGElement>) => {
    const step = (x1 - x0) * (e.shiftKey ? 0.05 : 0.01);
    if (e.key === 'ArrowRight') onMu(mu + step);
    else if (e.key === 'ArrowLeft') onMu(mu - step);
    else return;
    e.preventDefault();
  };

  const unit = fn === 'curve' ? 'm' : 'rad';
  const xTicks = fn === 'curve' ? [-4, -2, 0, 2, 4] : [-Math.PI, -Math.PI / 2, 0, Math.PI / 2, Math.PI];
  const xLab = (v: number) => (fn === 'curve' ? String(v) : ['−π', '−π/2', '0', 'π/2', 'π'][xTicks.indexOf(v)]);
  const yTicks = fn === 'curve' ? [-4, -2, 0, 2, 4, 6, 8] : [-2, -1, 0, 1, 2];
  const flat = ek.std < 1e-3;

  return (
    <svg ref={svgRef} className="filters-ekf-svg" viewBox={`0 0 ${VW} ${VH}`} role="img" aria-label={`Input belief mean ${f2(mu)} ${unit}, standard deviation ${f2(s)} ${unit}. True output mean ${f2(tm.mean)} m, EKF mean ${f2(ek.mean)} m.`}>
      {/* frames and grid */}
      {yTicks.map((v) => (
        <g key={`y${v}`}>
          <line x1={MAIN.x0} x2={MAIN.x1} y1={sy(v)} y2={sy(v)} stroke="var(--grid)" />
          <line x1={OUT.x0} x2={OUT.x1} y1={sy(v)} y2={sy(v)} stroke="var(--grid)" />
          <text className="filters-tick" x={MAIN.x0 - 6} y={sy(v) + 4} textAnchor="end">
            {v}
          </text>
        </g>
      ))}
      {xTicks.map((v) => (
        <g key={`x${v}`}>
          <line x1={sx(v)} x2={sx(v)} y1={MAIN.y0} y2={MAIN.y1} stroke="var(--grid)" />
          <line x1={sx(v)} x2={sx(v)} y1={INP.y0} y2={INP.y1} stroke="var(--grid)" />
          <text className="filters-tick" x={sx(v)} y={INP.y1 + 15} textAnchor="middle">
            {xLab(v)}
          </text>
        </g>
      ))}
      <rect x={MAIN.x0} y={MAIN.y0} width={MAIN.x1 - MAIN.x0} height={MAIN.y1 - MAIN.y0} fill="none" stroke="var(--border)" />
      <rect x={OUT.x0} y={MAIN.y0} width={OUT.x1 - OUT.x0} height={MAIN.y1 - MAIN.y0} fill="none" stroke="var(--border)" />
      <rect x={MAIN.x0} y={INP.y0} width={MAIN.x1 - MAIN.x0} height={INP.y1 - INP.y0} fill="none" stroke="var(--border)" />
      <text className="filters-axis" x={(MAIN.x0 + MAIN.x1) / 2} y={VH - 8} textAnchor="middle">
        {fn === 'curve' ? 'input x (m)' : 'heading θ (rad)'}
      </text>
      <text className="filters-axis" x={MAIN.x0 + 6} y={MAIN.y0 + 14}>
        output y (m)
      </text>
      <text className="filters-tag" x={OUT.x1 - 4} y={MAIN.y0 + 14} textAnchor="end" fill="var(--text-2)">
        output belief
      </text>
      <text className="filters-tag" x={MAIN.x1 - 6} y={INP.y0 + 14} textAnchor="end" fill="var(--text-2)">
        input belief
      </text>

      {/* rays: each sample pushed through the true model */}
      <path d={raysV} stroke="var(--m1)" strokeOpacity={0.22} strokeWidth={1} fill="none" />
      <path d={raysH} stroke="var(--m1)" strokeOpacity={0.22} strokeWidth={1} fill="none" />

      {/* the model and its tangent at the mean */}
      <path d={curve} stroke="var(--text)" strokeWidth={2.4} fill="none" strokeLinejoin="round" />
      <path d={tangent} stroke="var(--m3)" strokeWidth={2.2} strokeDasharray="8 5" fill="none" />
      <circle cx={sx(mu)} cy={sy(ek.mean)} r={5} fill="var(--m3)" />
      <text className="filters-tag" x={sx(mu) + (ek.G >= 0 ? 10 : -10)} y={sy(ek.mean) + 18} textAnchor={ek.G >= 0 ? "start" : "end"} fill="var(--m3)">
        slope G = {f2(ek.G)}
      </text>

      {/* output: histogram (truth) vs EKF Gaussian */}
      <path d={bars} fill="var(--m1)" fillOpacity={0.35} stroke="none" />
      {flat ? (
        <line x1={OUT.x0} x2={OUT.x1} y1={sy(ek.mean)} y2={sy(ek.mean)} stroke="var(--m3)" strokeWidth={4} />
      ) : (
        <path d={ekD} stroke="var(--m3)" strokeWidth={2.4} fill="none" />
      )}
      <line x1={OUT.x0} x2={OUT.x1} y1={sy(tm.mean)} y2={sy(tm.mean)} stroke="var(--m1)" strokeWidth={2} strokeDasharray="3 3" />
      <line x1={OUT.x0} x2={OUT.x1} y1={sy(ek.mean)} y2={sy(ek.mean)} stroke="var(--m3)" strokeWidth={2} strokeDasharray="6 3" />
      <path d={`M${OUT.x1 + 2} ${sy(tm.mean)}l7 -5v10Z`} fill="var(--m1)" />
      <path d={`M${OUT.x1 + 2} ${sy(ek.mean)}l7 -5v10Z`} fill="var(--m3)" />
      {flat && (
        <text className="filters-tag" x={OUT.x0 + 4} y={sy(ek.mean) - 7} fill="var(--m3)">
          EKF: all at one point
        </text>
      )}

      {/* input belief and its draggable mean */}
      <path d={inD} fill="var(--m1)" fillOpacity={0.2} stroke="var(--m1)" strokeWidth={2} />
      <rect x={MAIN.x0} y={INP.y0} width={MAIN.x1 - MAIN.x0} height={INP.y1 - INP.y0} fill="transparent" style={{ cursor: 'ew-resize', touchAction: 'none' }} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} />
      <g className="filters-drag" tabIndex={0} role="slider" aria-label={`Input mean, ${f2(mu)} ${unit}`} aria-valuenow={Number(mu.toFixed(2))} onKeyDown={onKey}>
        <line x1={sx(mu)} x2={sx(mu)} y1={INP.y0} y2={INP.y1} stroke="var(--accent)" strokeWidth={1.5} strokeDasharray="3 3" pointerEvents="none" />
        <circle className="filters-drag-ring" cx={sx(mu)} cy={INP.y1} r={8} fill="var(--surface)" stroke="var(--accent)" strokeWidth={3} pointerEvents="none" />
      </g>
    </svg>
  );
}

// ------------------------------------------------------------------ error vs σ

function ErrorCharts({ fn, mu, s, k }: { fn: FnId; mu: number; s: number; k: number }) {
  const sMax = fn === 'curve' ? 1.6 : 1.8;
  const data = useMemo(() => {
    const n = 120;
    const xs = new Float64Array(n + 1);
    const tMean = new Float64Array(n + 1);
    const eMean = new Float64Array(n + 1);
    const tStd = new Float64Array(n + 1);
    const eStd = new Float64Array(n + 1);
    for (let i = 0; i <= n; i++) {
      const sv = 0.02 + ((sMax - 0.02) * i) / n;
      const t = trueMoments(fn, mu, sv, k);
      const e = ekfMoments(fn, mu, sv, k);
      xs[i] = sv;
      tMean[i] = t.mean;
      eMean[i] = e.mean;
      tStd[i] = t.std;
      eStd[i] = e.std;
    }
    return { xs, tMean, eMean, tStd, eStd };
  }, [fn, mu, k, sMax]);
  const lo = Math.min(...data.tMean, ...data.eMean);
  const hi = Math.max(...data.tMean, ...data.eMean);
  const pad = Math.max(0.2, (hi - lo) * 0.15);
  const sTop = niceTop(Math.max(...data.tStd, ...data.eStd) * 1.08);
  const unit = fn === 'curve' ? 'm' : 'rad';
  const t = trueMoments(fn, mu, s, k);
  const e = ekfMoments(fn, mu, s, k);
  return (
    <>
      <div className="filters-two">
        <div>
          <div className="filters-label">output mean (m)</div>
          <Plot x={{ min: 0, max: sMax, label: `input σ (${unit})` }} y={{ min: lo - pad, max: hi + pad }} height={150} margin={{ l: 40, r: 8 }} ariaLabel="True and EKF output mean against the input spread">
            <Line points={{ x: data.xs, y: data.eMean }} color="var(--m3)" width={2.2} dash="7 4" />
            <Line points={{ x: data.xs, y: data.tMean }} color="var(--m1)" width={2.4} />
            <VLine x={s} color="var(--accent)" dash={false} />
            <Dot x={s} y={t.mean} color="var(--m1)" r={3.5} />
            <Dot x={s} y={e.mean} color="var(--m3)" r={3.5} />
          </Plot>
        </div>
        <div>
          <div className="filters-label">output std (m)</div>
          <Plot x={{ min: 0, max: sMax, label: `input σ (${unit})` }} y={{ min: 0, max: sTop }} height={150} margin={{ l: 40, r: 8 }} ariaLabel="True and EKF output standard deviation against the input spread">
            <Line points={{ x: data.xs, y: data.eStd }} color="var(--m3)" width={2.2} dash="7 4" />
            <Line points={{ x: data.xs, y: data.tStd }} color="var(--m1)" width={2.4} />
            <VLine x={s} color="var(--accent)" dash={false} />
            <Dot x={s} y={t.std} color="var(--m1)" r={3.5} />
            <Dot x={s} y={e.std} color="var(--m3)" r={3.5} />
          </Plot>
        </div>
      </div>
      <Legend
        items={[
          { label: 'truth', color: 'var(--m1)' },
          { label: 'EKF', color: 'var(--m3)', dash: true },
        ]}
      />
      <Rich className="filters-note" text="At small $\sigma$ the lines touch: over a narrow belief any smooth model looks straight, so the EKF is accurate. The gap opens as the belief widens: that gap is the price of linearising." />
    </>
  );
}

// ------------------------------------------------------------------ update mode: geometry and plot

function GeoDraw({ ru, rr }: { ru: RangeIn; rr: ReturnType<typeof rangeUpdate> }) {
  const { sx, sy, clip } = usePlot();
  const rx = Math.abs(sx(ru.z) - sx(0));
  const ry = Math.abs(sy(ru.z) - sy(0));
  const out: ReactNode[] = [];
  out.push(<line key="rail" x1={sx(RANGE_X[0])} x2={sx(RANGE_X[1])} y1={sy(0)} y2={sy(0)} stroke="var(--text-3)" strokeWidth={4} strokeLinecap="round" />);
  out.push(<ellipse key="circle" cx={sx(0)} cy={sy(ru.b)} rx={rx} ry={ry} fill="none" stroke="var(--m2)" strokeWidth={1.8} strokeDasharray="6 4" clipPath={`url(#${clip})`} />);
  out.push(
    <g key="beacon">
      <path d={`M${sx(0)} ${sy(ru.b) - 9}L${sx(0) + 8} ${sy(ru.b)}L${sx(0)} ${sy(ru.b) + 9}L${sx(0) - 8} ${sy(ru.b)}Z`} fill="var(--m2)" />
      <text className="plot-note" x={sx(0) - 12} y={sy(ru.b) + 4} textAnchor="end" fill="var(--m2)">
        beacon
      </text>
    </g>
  );
  if (rr.cut !== null)
    for (const c of [-rr.cut, rr.cut])
      out.push(
        <g key={`cut${c}`}>
          <line x1={sx(0)} y1={sy(ru.b)} x2={sx(c)} y2={sy(0)} stroke="var(--m2)" strokeWidth={1.2} strokeOpacity={0.6} />
          <circle cx={sx(c)} cy={sy(0)} r={5} fill="var(--m2)" />
        </g>
      );
  out.push(
    <g key="pred">
      <rect x={sx(ru.mu) - 12} y={sy(0) - 18} width={24} height={12} rx={3} fill="var(--pred)" fillOpacity={0.85} />
      <text className="plot-note" x={sx(ru.mu)} y={sy(0) - 23} textAnchor="middle" fill="var(--pred)">
        μ̄
      </text>
    </g>
  );
  return <g pointerEvents="none">{out}</g>;
}

function RangeGeometry({ ru, rr }: { ru: RangeIn; rr: ReturnType<typeof rangeUpdate> }) {
  // Equal scales on both axes, so the range circle is drawn as a circle (the plot clips its top). The y label
  // keeps the left margin equal to the density plot's, so the two x axes line up.
  const [wrap, width] = useWidth<HTMLDivElement>(600);
  const H = 170;
  const iw = Math.max(100, width - 54 - 14);
  const ih = H - 12 - 26;
  const yMin = -0.7;
  const yMax = yMin + (ih * (RANGE_X[1] - RANGE_X[0])) / iw;
  return (
    <div ref={wrap}>
      <Plot
        x={{ min: RANGE_X[0], max: RANGE_X[1] }}
        y={{ min: yMin, max: yMax, label: 'y (m)', ticks: [0, 2] }}
        height={H}
        ariaLabel={`Beacon ${f2(ru.b)} m off the rail; reading ${f2(ru.z)} m${rr.cut !== null ? `; the range circle cuts the rail at ±${f2(rr.cut)} m` : ''}`}
      >
        <GeoDraw ru={ru} rr={rr} />
      </Plot>
    </div>
  );
}

function RangePlot({ ru, rr }: { ru: RangeIn; rr: ReturnType<typeof rangeUpdate> }) {
  const priorPeak = 1 / (ru.s * Math.sqrt(2 * Math.PI));
  const postPeak = Math.max(...rr.post);
  const ekfPeak = 1 / Math.sqrt(2 * Math.PI * rr.ekfS2);
  const top = niceTop(1.1 * Math.max(priorPeak, postPeak, Math.min(ekfPeak, 2.5 * Math.max(priorPeak, postPeak))));
  const likMax = Math.max(...rr.lik, 1e-300);
  const scale = (0.8 * top) / likMax;
  const likS = useMemo(() => rr.lik.map((v) => v * scale), [rr, scale]);
  const linS = useMemo(() => rr.linLik.map((v) => v * scale), [rr, scale]);
  return (
    <Plot x={{ min: RANGE_X[0], max: RANGE_X[1], label: 'position on the rail x (m)' }} y={{ min: 0, max: top, label: 'density (1/m)' }} height={240} ariaLabel={`True posterior with ${rr.modes.length} peak(s); EKF posterior at ${f2(rr.ekfMu)} m`}>
      <Line points={{ x: rr.xs, y: rr.prior }} color="var(--pred)" width={2} dash="7 4" />
      <Line points={{ x: rr.xs, y: likS }} color="var(--m2)" width={1.8} />
      <Line points={{ x: rr.xs, y: linS }} color="var(--m3)" width={1.6} dash="3 3" />
      <Area points={{ x: rr.xs, y: rr.post }} color="var(--m1)" opacity={0.2} />
      <Line points={{ x: rr.xs, y: rr.post }} color="var(--m1)" width={2.6} />
      <Line points={{ x: rr.xs, y: rr.ekf }} color="var(--m3)" width={2.6} />
      <VLine x={ru.mu} color="var(--pred)" dash="2 3" label="μ̄" />
      {rr.modes.map((m) => (
        <Dot key={m} x={m} y={rr.post[Math.round(((m - RANGE_X[0]) / (RANGE_X[1] - RANGE_X[0])) * (rr.xs.length - 1))]} color="var(--m1)" r={3.5} />
      ))}
      <HLine y={0} color="var(--border)" dash={false} />
    </Plot>
  );
}

function RangeVerdict({ rr, ru }: { rr: ReturnType<typeof rangeUpdate>; ru: RangeIn }) {
  const ekS = Math.sqrt(rr.ekfS2);
  if (rr.cut === null)
    return (
      <Callout kind="note" title="The reading is shorter than the beacon offset">
        <Rich text={`No point on the rail is closer than $b$ = ${f2(ru.b)} m to the beacon, so the reading mainly says “near $x = 0$”. Both filters agree roughly here.`} />
      </Callout>
    );
  if (rr.modes.length >= 2)
    return (
      <Callout kind="bad" title="Two peaks; the EKF can only keep one Gaussian">
        <Rich
          text={`The true belief has peaks at ${rr.modes.map((m) => `${f2(m)} m`).join(' and ')}. The EKF linearised at $\\bar\\mu$ = ${f2(ru.mu)} m (slope $H$ = ${f2(rr.H)}) and returned $\\mathcal N$(${f2(rr.ekfMu)} m, (${f2(ekS)} m)²)${Math.abs(rr.K) < 0.05 ? ': it barely used the reading' : ''}. Keeping both hypotheses needs a multimodal belief: a particle filter (or a grid).`}
        />
      </Callout>
    );
  const off = Math.abs(rr.ekfMu - rr.truthMean);
  return off > 0.5 * Math.max(rr.truthStd, 0.05) ? (
    <Callout kind="warn" title="One peak, but the EKF misses it">
      <Rich text={`The prediction already rules out one side, so the truth has a single peak at ${f2(rr.modes[0] ?? rr.truthMean)} m. The EKF, using only the tangent at ${f2(ru.mu)} m, lands at ${f2(rr.ekfMu)} m.`} />
    </Callout>
  ) : (
    <Callout kind="ok" title="The EKF agrees with the truth">
      <Rich text="A narrow prediction on one side of the beacon sees an almost straight piece of $h(x)$, so the tangent is a good model and the EKF update is close to exact." />
    </Callout>
  );
}
