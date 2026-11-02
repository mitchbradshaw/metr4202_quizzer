// Newton–Raphson inverse kinematics on a planar arm, one iteration at a time (summary notes §6 "Numerical IK";
// 2022 Q4, Q12, Q18, Q21; review deck slide 18 learning outcome "describe the Newton–Raphson process").
//
// Left: the workspace. Drag the target x_d and the dashed initial guess (grab its elbow or tip). Each iterate's arm
// is drawn, with the error e = x_d − x(θ), the step the linear model predicts (J Δθ, dashed) and the path the
// tip really takes while θ moves to θ + Δθ (dotted). Right: joint space (θ1, θ2) with the iterates' path, the
// exact solutions and, behind them, the basin map: every initial guess coloured by the solution Newton–Raphson
// reaches from it (core/kin planarIk logic; see kinikModel.ts). Below: the numbers of the current step (J, its
// inverse or damped pseudoinverse, Δθ) and ‖e‖ per iteration on a log scale.
import { memo, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as RKeyboardEvent, type MutableRefObject, type PointerEvent as RPointerEvent } from 'react';
import type { ExploreItem } from '../../../engine/types';
import { planarFk, type Mat } from '../../../core/kin';
import { Button, LinkButton, More, Readout, Readouts, Segmented, Select, Slider, Toggle } from '../../../ui/kit';
import { StepControls, useStepper } from '../../../ui/stepper';
import { PredictReveal } from '../../../ui/PredictReveal';
import { Rich, TeX } from '../../../ui/Rich';
import { HLine, Line, Plot, usePlot } from '../../../plot/Plot';
import { svgPoint } from '../../../ui/diagrams';
import { rgbOf, useThemeColors } from '../../../ui/theme';
import { href } from '../../../app/router';
import { fmt, tex } from '../../../engine/format';
import { BASIN_NEG, BASIN_POS, MAX_ITER, TAU, TOL, basinMap, elbowName, nrRun, reach, selfMotion3, stepArc, twoLinkSolutions, wrapPi, wrapTau, type NrRun, type V2 } from './kinikModel';
import '../kinik.css';

export const meta: Omit<ExploreItem, 'component'> = {
  id: 'ik',
  title: 'Newton–Raphson IK, iteration by iteration',
  summary:
    'Drag the target and the initial guess of a planar arm and step $\\theta \\leftarrow \\theta + J^{-1}e$. See it converge in a few steps, find the other elbow from a different guess, blow up near a singularity (and how damping $\\lambda$ tames it), fail outside the workspace, and land on one of infinitely many solutions with three links.',
  notice:
    'Numerical IK returns the solution **whose basin the initial guess starts in** (usually the nearest one), not "the" answer; near a singularity ($\\det J \\approx 0$) the steps blow up, and outside the workspace it never converges.',
  minutes: 10,
};

// ------------------------------------------------------------------ arms and scenarios

const LEN2 = [1.0, 0.7];
const LEN3 = [0.8, 0.6, 0.4];
const lensOf = (n: 2 | 3) => (n === 2 ? LEN2 : LEN3);

type ScenarioId = 'free' | 'elbow' | 'outside' | 'stretched' | 'redundant';
interface Scenario {
  label: string;
  n: 2 | 3;
  target: V2;
  guess: number[];
  lambda: number;
  note: string;
}
const SCENARIOS: Record<ScenarioId, Scenario> = {
  free: {
    label: 'Two links: a good guess',
    n: 2,
    target: [1.1, 0.6],
    guess: [0.7, 1.9],
    lambda: 0,
    note: 'Press **▶|** to take one Newton–Raphson step. Drag the target ⊕, grab the dashed guess arm by its elbow or tip, or click the joint-space map to start from somewhere else.',
  },
  elbow: {
    label: 'Two links: guess bent the other way',
    n: 2,
    target: [1.1, 0.6],
    guess: [0.7, -1.9],
    lambda: 0,
    note: 'Same target, but the guess bends the other way ($\\theta_2 < 0$). Newton–Raphson follows the local slope from wherever it starts.',
  },
  outside: {
    label: 'Target out of reach',
    n: 2,
    target: [1.6, 0.9],
    guess: [0.3, 0.9],
    lambda: 0,
    note: 'The target is beyond $L_1 + L_2$ = 1.7 m: no joint angles reach it, so no initial guess can converge (the whole map is grey). Then raise $\\lambda$ to 0.3 m and watch it settle on the nearest reachable point instead of thrashing.',
  },
  stretched: {
    label: 'Nearly straight start (singular)',
    n: 2,
    target: [0.95, 0.6],
    guess: [0.35, 0.03],
    lambda: 0,
    note: 'The guess is almost straight: $\\det J = L_1 L_2 \\sin\\theta_2 \\approx$ 0.021 m², so $J^{-1}$ is huge and one step swings the joints by tens of radians. Then try $\\lambda$ = 0.2 m.',
  },
  redundant: {
    label: 'Three links (redundant)',
    n: 3,
    target: [0.9, 0.7],
    guess: [0.2, 0.9, 0.9],
    lambda: 0,
    note: 'Three joints, two coordinates to match: a whole curve of solutions (faint arms). Newton–Raphson with $J^\\dagger = J^T(JJ^T)^{-1}$ takes the smallest joint step each time, so it lands on the solution nearest its guess.',
  },
};

// ------------------------------------------------------------------ drawing frames

const WS = { W: 460, H: 410, CX: 230, CY: 205, S: 92 };
const wx = (x: number) => WS.CX + WS.S * x;
const wy = (y: number) => WS.CY - WS.S * y;
const fromWs = (px: number, py: number): V2 => [(px - WS.CX) / WS.S, (WS.CY - py) / WS.S];
const XLIM = 2.35;
const YLIM = 2.1;
const clampT = (p: V2): V2 => [Math.max(-XLIM, Math.min(XLIM, p[0])), Math.max(-YLIM, Math.min(YLIM, p[1]))];
const armD = (pts: readonly V2[]) => pts.map((p, i) => `${i ? 'L' : 'M'}${wx(p[0]).toFixed(1)} ${wy(p[1]).toFixed(1)}`).join('');
const pathD = (pts: readonly V2[]) => armD(pts);

const JS = { W: 460, H: 410, L: 70, T: 12, SZ: 350 };
const jx = (t: number) => JS.L + (t / TAU) * JS.SZ;
const jy = (t: number) => JS.T + JS.SZ - (t / TAU) * JS.SZ;
const fromJs = (px: number, py: number): V2 => [((px - JS.L) / JS.SZ) * TAU, ((JS.T + JS.SZ - py) / JS.SZ) * TAU];
const PI_TICKS: [number, string][] = [
  [0, '0'],
  [Math.PI / 2, 'π/2'],
  [Math.PI, 'π'],
  [(3 * Math.PI) / 2, '3π/2'],
  [TAU, '2π'],
];

/** A short step on the torus (|Δ| < π), drawn at every 2π offset that shows inside [0, 2π)². */
function torusSeg(a: readonly number[], b: readonly number[]): string {
  const a0 = [wrapTau(a[0]), wrapTau(a[1])];
  const d = [b[0] - a[0], b[1] - a[1]];
  let s = '';
  for (const ox of [-TAU, 0, TAU])
    for (const oy of [-TAU, 0, TAU]) {
      const x1 = a0[0] + ox;
      const y1 = a0[1] + oy;
      const x2 = x1 + d[0];
      const y2 = y1 + d[1];
      if (Math.max(x1, x2) < 0 || Math.min(x1, x2) > TAU || Math.max(y1, y2) < 0 || Math.min(y1, y2) > TAU) continue;
      s += `M${jx(x1).toFixed(1)} ${jy(y1).toFixed(1)}L${jx(x2).toFixed(1)} ${jy(y2).toFixed(1)}`;
    }
  return s;
}

/** Calls fn at most once per animation frame with the latest arguments. */
function useRafThrottle<A extends unknown[]>(fn: (...a: A) => void) {
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const pending = useRef<A | null>(null);
  const raf = useRef(0);
  useEffect(() => () => cancelAnimationFrame(raf.current), []);
  return useCallback((...a: A) => {
    pending.current = a;
    if (raf.current) return;
    raf.current = requestAnimationFrame(() => {
      raf.current = 0;
      const p = pending.current;
      pending.current = null;
      if (p) fnRef.current(...p);
    });
  }, []);
}

const n3 = (x: number) => tex(Math.abs(x) < 5e-5 ? 0 : x, 4);
const vecTeX = (a: readonly number[]) => `\\begin{bmatrix} ${a.map(n3).join(' \\\\ ')} \\end{bmatrix}`;
const matTeX = (A: Mat) => `\\begin{bmatrix} ${A.map((r) => r.map(n3).join(' & ')).join(' \\\\ ')} \\end{bmatrix}`;

type Drag = { kind: 'target' } | { kind: 'guess'; h: number } | { kind: 'js' } | null;

// ------------------------------------------------------------------ component

export default function IkNewton() {
  const [scen, setScen] = useState<ScenarioId>('free');
  const [nLinks, setNLinks] = useState<2 | 3>(2);
  const [target, setTarget] = useState<V2>(SCENARIOS.free.target);
  const [guess, setGuess] = useState<number[]>(SCENARIOS.free.guess);
  const [lambda, setLambda] = useState(0);
  const [showSols, setShowSols] = useState(true);
  const [showLin, setShowLin] = useState(true);
  const [dragging, setDragging] = useState(false);
  const lengths = lensOf(nLinks);
  const R = reach(lengths);

  const run = useMemo(() => nrRun(lengths, target, guess, lambda), [lengths, target, guess, lambda]);
  const st = useStepper(run.steps.length - 1, { speed: 2 });
  const i = Math.min(st.i, run.steps.length - 1);
  const cur = run.steps[i];
  const next = run.steps[i + 1];
  const n = run.steps.length - 1;

  const cmp = useMemo(() => (lambda > 0 ? nrRun(lengths, target, guess, 0) : null), [lengths, target, guess, lambda]);

  const sols = useMemo(() => (nLinks === 2 ? twoLinkSolutions(LEN2[0], LEN2[1], target) : []), [nLinks, target]);
  const curves = useMemo(() => (nLinks === 3 ? selfMotion3(LEN3, target) : []), [nLinks, target]);
  const solNames = useMemo(() => sols.map((s) => elbowName(LEN2, s)), [sols]);

  // pending "play after the next run is computed" (predict buttons)
  const pendingPlay = useRef<'play' | 'first' | null>(null);
  useEffect(() => {
    if (!pendingPlay.current) return;
    const mode = pendingPlay.current;
    pendingPlay.current = null;
    st.setI(0);
    if (mode === 'play') st.play();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run]);

  const load = useCallback((id: ScenarioId, then: 'play' | 'first' = 'first', over?: Partial<Scenario>) => {
    const s = { ...SCENARIOS[id], ...over };
    setScen(id);
    setNLinks(s.n);
    setTarget(s.target);
    setGuess(s.guess.slice());
    setLambda(s.lambda);
    pendingPlay.current = then;
    st.pause();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------------------------------------------------------------- pointer handling
  const wsSvg = useRef<SVGSVGElement>(null);
  const jsSvg = useRef<SVGSVGElement>(null);
  const drag = useRef<Drag>(null);
  const guessRef = useRef(guess);
  guessRef.current = guess;
  const lensRef = useRef(lengths);
  lensRef.current = lengths;

  const moveTarget = useRafThrottle((p: V2) => setTarget(clampT(p)));
  const moveGuessLink = useRafThrottle((h: number, p: V2) => {
    const th = guessRef.current.slice();
    const pts = planarFk(lensRef.current, th);
    const base = pts[h];
    const absNow = th.slice(0, h + 1).reduce((a, b) => a + b, 0);
    const want = Math.atan2(p[1] - base[1], p[0] - base[0]);
    th[h] += wrapPi(want - absNow);
    setGuess(th);
  });
  const moveGuessJs = useRafThrottle((t: V2) => {
    const th = guessRef.current.slice();
    th[0] = Math.max(0, Math.min(TAU, t[0]));
    th[1] = Math.max(0, Math.min(TAU, t[1]));
    setGuess(th);
  });

  const startDrag = (d: Drag, svg: SVGSVGElement | null, e: RPointerEvent) => {
    drag.current = d;
    setDragging(true);
    try {
      svg?.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    e.stopPropagation();
  };
  const endDrag = () => {
    if (!drag.current) return;
    drag.current = null;
    setDragging(false);
  };
  const onWsMove = (e: RPointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    if (!d || !wsSvg.current) return;
    const q = svgPoint(wsSvg.current, e.clientX, e.clientY);
    const p = fromWs(q.x, q.y);
    if (d.kind === 'target') moveTarget(p);
    else if (d.kind === 'guess') moveGuessLink(d.h, p);
  };
  const onWsBackground = (e: RPointerEvent<SVGRectElement>) => {
    if (!wsSvg.current) return;
    const q = svgPoint(wsSvg.current, e.clientX, e.clientY);
    setTarget(clampT(fromWs(q.x, q.y)));
    startDrag({ kind: 'target' }, wsSvg.current, e);
  };
  const onJsDown = (e: RPointerEvent<SVGSVGElement>) => {
    if (!jsSvg.current) return;
    const q = svgPoint(jsSvg.current, e.clientX, e.clientY);
    const t = fromJs(q.x, q.y);
    if (t[0] < -0.05 || t[0] > TAU + 0.05 || t[1] < -0.05 || t[1] > TAU + 0.05) return;
    moveGuessJs(t);
    startDrag({ kind: 'js' }, jsSvg.current, e);
  };
  const onJsMove = (e: RPointerEvent<SVGSVGElement>) => {
    if (drag.current?.kind !== 'js' || !jsSvg.current) return;
    const q = svgPoint(jsSvg.current, e.clientX, e.clientY);
    moveGuessJs(fromJs(q.x, q.y));
  };
  const onTargetKey = (e: RKeyboardEvent) => {
    const s = e.shiftKey ? 0.1 : 0.02;
    const d: Record<string, V2> = { ArrowLeft: [-s, 0], ArrowRight: [s, 0], ArrowUp: [0, s], ArrowDown: [0, -s] };
    const v = d[e.key];
    if (!v) return;
    e.preventDefault();
    setTarget((t) => clampT([t[0] + v[0], t[1] + v[1]]));
  };
  const onGuessKey = (h: number) => (e: RKeyboardEvent) => {
    const s = e.shiftKey ? 0.15 : 0.03;
    const dir = e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? 1 : e.key === 'ArrowRight' || e.key === 'ArrowDown' ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    setGuess((g) => g.map((t, k) => (k === h ? t + dir * s : t)));
  };
  const onJsKey = (e: RKeyboardEvent) => {
    const s = e.shiftKey ? 0.2 : 0.05;
    const d: Record<string, V2> = { ArrowLeft: [-s, 0], ArrowRight: [s, 0], ArrowUp: [0, s], ArrowDown: [0, -s] };
    const v = d[e.key];
    if (!v) return;
    e.preventDefault();
    setGuess((g) => g.map((t, k) => (k < 2 ? wrapTau(t + v[k]) : t)));
  };

  // ---------------------------------------------------------------- basin map (canvas)
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const colors = useThemeColors(['--m1', '--m2', '--text-3'] as const);
  const showBasin = nLinks === 2;
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    if (!showBasin) {
      ctx.clearRect(0, 0, cv.width, cv.height);
      return;
    }
    const N = dragging ? 48 : 100;
    const code = new Uint8Array(N * N);
    const its = new Uint8Array(N * N);
    basinMap(LEN2[0], LEN2[1], target, lambda, N, code, its);
    if (cv.width !== N) cv.width = N;
    if (cv.height !== N) cv.height = N;
    const img = ctx.createImageData(N, N);
    const cA = rgbOf(colors['--m1']);
    const cB = rgbOf(colors['--m2']);
    const cN = rgbOf(colors['--text-3']);
    for (let j = 0; j < N; j++)
      for (let k = 0; k < N; k++) {
        const src = j * N + k;
        const p = ((N - 1 - j) * N + k) * 4;
        const c = code[src];
        const col = c === BASIN_POS ? cA : c === BASIN_NEG ? cB : cN;
        img.data[p] = col[0];
        img.data[p + 1] = col[1];
        img.data[p + 2] = col[2];
        img.data[p + 3] = c ? Math.max(40, 128 - 4 * its[src]) : 50;
      }
    ctx.putImageData(img, 0, 0);
  }, [showBasin, target, lambda, dragging, colors]);

  // ---------------------------------------------------------------- derived drawing data
  const guessPts = planarFk(lengths, guess);
  const curPts = planarFk(lengths, cur.theta);
  const ghostArms = run.steps.slice(0, i).map((s) => planarFk(lengths, s.theta));
  const arc = next && showLin ? stepArc(lengths, cur.theta, next.theta, Math.min(400, 24 + Math.ceil(Math.hypot(...next.theta.map((t, k) => t - cur.theta[k])) * 10))) : null;
  const linPred: V2 | null = next && showLin ? (() => {
    const d = next.theta.map((t, k) => t - cur.theta[k]);
    const Jd: V2 = [cur.J[0].reduce((s, a, k) => s + a * d[k], 0), cur.J[1].reduce((s, a, k) => s + a * d[k], 0)];
    return [cur.tip[0] + Jd[0], cur.tip[1] + Jd[1]];
  })() : null;
  const fan = useMemo(() => {
    if (nLinks === 2) return sols.map((s, k) => ({ k, pts: planarFk(LEN2, s) }));
    const out: { k: number; pts: V2[] }[] = [];
    for (const c of curves) for (let m = 0; m < c.pts.length; m += 18) out.push({ k: c.branch, pts: planarFk(LEN3, c.pts[m]) });
    return out;
  }, [nLinks, sols, curves]);

  // joint-space path of the iterates
  const jsPath = useMemo(() => {
    let smooth = '';
    const jumps: { a: V2; b: V2 }[] = [];
    for (let k = 0; k < i; k++) {
      const a = run.steps[k].theta;
      const b = run.steps[k + 1].theta;
      if (Math.abs(b[0] - a[0]) >= Math.PI || Math.abs(b[1] - a[1]) >= Math.PI) jumps.push({ a: [wrapTau(a[0]), wrapTau(a[1])], b: [wrapTau(b[0]), wrapTau(b[1])] });
      else smooth += torusSeg(a, b);
    }
    return { smooth, jumps };
  }, [run, i]);
  const curveD = useMemo(
    () =>
      curves.map((c) => {
        let d = '';
        for (let m = 1; m < c.pts.length; m++) d += torusSeg(c.pts[m - 1], c.pts[m]);
        return { branch: c.branch, d };
      }),
    [curves]
  );

  // ---------------------------------------------------------------- status
  const final = run.steps[n];
  const out = Math.hypot(target[0], target[1]) > R.outer + 1e-9;
  const inHole = Math.hypot(target[0], target[1]) < R.inner - 1e-9;
  const finalSol = nLinks === 2 && run.converged ? (Math.sin(final.theta[1]) >= 0 ? 0 : 1) : -1;
  const status = run.converged
    ? `✓ Converged in ${n} iteration${n === 1 ? '' : 's'} (‖e‖ < 10⁻⁴ m)${finalSol >= 0 ? ` to the ${solNames[finalSol] ?? ''} solution (θ₂ ${finalSol === 0 ? '>' : '<'} 0)` : ' to one of infinitely many solutions'}.`
    : out
      ? `✗ No solution: the target is ${fmt(Math.hypot(target[0], target[1]) - R.outer, 3)} m beyond the reach L₁ + ${nLinks === 3 ? 'L₂ + L₃' : 'L₂'} = ${fmt(R.outer, 3)} m, so no guess can converge.`
      : inHole
        ? `✗ No solution: the target is inside the unreachable hole (radius ${fmt(R.inner, 3)} m).`
        : `✗ Not converged after ${MAX_ITER} iterations from this guess (steps near a singularity, or damping too strong).`;

  const api = useRef<Record<string, () => void>>({});
  api.current = {
    elbow: () => load('elbow', 'play'),
    // all 30 iterations thrash without converging: play them quickly
    outside: () => {
      st.setSpeed(8);
      load('outside', 'play');
    },
    stretch: () => load('stretched', 'first'),
    damp: () => {
      st.setSpeed(4);
      load('stretched', 'play', { lambda: 0.2 });
    },
    redundant: () => {
      setShowSols(true);
      load('redundant', 'play');
    },
  };

  const sc = SCENARIOS[scen];
  const label = (k: number) => (k === 0 ? 'A' : 'B');

  return (
    <div className="kin-ik">
      <div className="kin-ik-toolbar">
        <Segmented
          label="Number of links"
          value={nLinks}
          onChange={(v) => {
            setNLinks(v);
            setGuess((g) => (v === 3 ? [g[0], g[1], g[2] ?? 0.6] : [g[0], g[1]]));
            if (v === 3 && Math.hypot(target[0], target[1]) > LEN3.reduce((a, b) => a + b, 0)) setTarget(SCENARIOS.redundant.target);
            st.setI(0);
          }}
          options={[
            { value: 2, label: '2 links', title: 'L₁ = 1.0 m, L₂ = 0.7 m' },
            { value: 3, label: '3 links (redundant)', title: 'L₁ = 0.8 m, L₂ = 0.6 m, L₃ = 0.4 m' },
          ]}
        />
        <Select
          label="Scenario"
          value={scen}
          options={(Object.keys(SCENARIOS) as ScenarioId[]).map((k) => ({ value: k, label: SCENARIOS[k].label }))}
          onChange={(v) => load(v, 'first')}
        />
        <Button
          onClick={() => {
            setGuess((g) => g.map((t, k) => (k === 0 ? t : -t)));
            st.setI(0);
          }}
          title="Mirror the guess: θ₂ → −θ₂ (and θ₃ → −θ₃)"
        >
          Flip guess elbow
        </Button>
        <Button
          onClick={() => {
            setGuess(guess.map(() => Math.random() * TAU));
            st.setI(0);
          }}
          title="A random initial guess"
        >
          🎲 Random guess
        </Button>
      </div>
      <Rich className="kin-ik-explain" text={sc.n === nLinks ? sc.note : SCENARIOS.free.note} />

      <div className="kin-ik-stepbar" style={{ marginTop: 8 }}>
        <StepControls
          st={st}
          label="iteration"
          speeds={[1, 2, 4, 8]}
          extra={
            <Button
              size="sm"
              onClick={() => {
                st.pause();
                st.setI(n);
              }}
              disabled={st.atEnd}
              title="Jump to the last iteration"
              aria-label="Jump to the last iteration"
            >
              ⏭ End
            </Button>
          }
        />
        <span className={`kin-ik-status ${i === n ? (run.converged ? 'is-ok' : 'is-bad') : ''}`} aria-live="polite">
          {i < n ? `Iteration ${i}: ‖e‖ = ${fmt(cur.err, 3)} m. Next: θ ← θ + Δθ.` : status}
        </span>
      </div>

      <div className="kin-ik-views">
        <section className="kin-ik-panel" aria-label="Workspace">
          <div className="kin-ik-panel-head">
            <h4>Workspace</h4>
            <span className="muted small">drag ⊕ · the dashed guess · click to move ⊕</span>
          </div>
          <svg
            ref={wsSvg}
            className="kin-ik-svg"
            viewBox={`0 0 ${WS.W} ${WS.H}`}
            role="group"
            aria-label={`Workspace of the ${nLinks}-link arm. Target at (${fmt(target[0], 3)}, ${fmt(target[1], 3)}) m.`}
            onPointerMove={onWsMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          >
            <rect x={0} y={0} width={WS.W} height={WS.H} fill="transparent" onPointerDown={onWsBackground} />
            <g pointerEvents="none">
              {[-2, -1.5, -1, -0.5, 0.5, 1, 1.5, 2].map((v) => (
                <g key={v}>
                  <line className="kin-ik-grid" x1={wx(v)} x2={wx(v)} y1={0} y2={WS.H} />
                  <line className="kin-ik-grid" y1={wy(v)} y2={wy(v)} x1={0} x2={WS.W} />
                </g>
              ))}
              <line className="kin-ik-axis" x1={0} x2={WS.W} y1={wy(0)} y2={wy(0)} />
              <line className="kin-ik-axis" y1={0} y2={WS.H} x1={wx(0)} x2={wx(0)} />
              {[-2, -1, 1, 2].map((v) => (
                <g key={`t${v}`}>
                  <text className="kin-ik-tick" x={wx(v)} y={wy(0) + 13} textAnchor="middle">
                    {v}
                  </text>
                  <text className="kin-ik-tick" x={wx(0) - 5} y={wy(v) + 4} textAnchor="end">
                    {v}
                  </text>
                </g>
              ))}
              <text className="kin-ik-label" x={WS.W - 8} y={wy(0) - 6} textAnchor="end">
                x (m)
              </text>
              <text className="kin-ik-label" x={wx(0) + 6} y={14}>
                y (m)
              </text>
              <circle className="kin-ik-reach" cx={wx(0)} cy={wy(0)} r={R.outer * WS.S} />
              {R.inner > 0.01 && <circle className="kin-ik-reach" cx={wx(0)} cy={wy(0)} r={R.inner * WS.S} />}
              <text className="kin-ik-note" x={wx(R.outer * Math.cos(-0.62))} y={wy(R.outer * Math.sin(-0.62)) + 14}>
                reach {fmt(R.outer, 3)} m
              </text>

              {showSols &&
                fan.map((f, k) => (
                  <path key={`f${k}`} d={armD(f.pts)} fill="none" stroke={f.k === 0 ? 'var(--m1)' : 'var(--m2)'} strokeWidth={nLinks === 2 ? 5 : 3} strokeLinecap="round" strokeLinejoin="round" opacity={nLinks === 2 ? 0.32 : 0.28} />
                ))}
              {nLinks === 2 &&
                showSols &&
                fan.map((f) => (
                  <text key={`fl${f.k}`} className="kin-ik-note" x={wx(f.pts[1][0]) + (f.pts[1][0] >= 0 ? 8 : -8)} y={wy(f.pts[1][1]) - 6} textAnchor={f.pts[1][0] >= 0 ? 'start' : 'end'} style={{ fill: f.k === 0 ? 'var(--m1)' : 'var(--m2)', fontWeight: 700 }}>
                    {label(f.k)}
                  </text>
                ))}

              {ghostArms.map((pts, k) => (
                <path key={`g${k}`} d={armD(pts)} fill="none" stroke="var(--text-3)" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" opacity={0.22 + (0.4 * (k + 1)) / Math.max(1, i)} />
              ))}

              {/* base */}
              <path d={`M${wx(0) - 11} ${wy(0) + 12}L${wx(0)} ${wy(0)}L${wx(0) + 11} ${wy(0) + 12}Z`} fill="var(--surface-3)" stroke="var(--text)" strokeWidth={1.5} />

              {/* the step ahead: linear prediction and the real tip path */}
              {arc && <path d={pathD(arc)} fill="none" stroke="var(--text-2)" strokeWidth={1.6} strokeDasharray="1.5 3.5" strokeLinecap="round" />}
              {next && showLin && <circle cx={wx(next.tip[0])} cy={wy(next.tip[1])} r={4.5} fill="var(--surface)" stroke="var(--text-2)" strokeWidth={1.6} />}

              {/* current iterate */}
              <path d={armD(curPts)} fill="none" stroke="var(--text)" strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" />
              {curPts.slice(0, -1).map((p, k) => (
                <circle key={`j${k}`} className="kin-ik-joint" cx={wx(p[0])} cy={wy(p[1])} r={4.5} />
              ))}
              <circle cx={wx(cur.tip[0])} cy={wy(cur.tip[1])} r={3.5} fill="var(--text)" />

              {/* error vector e and the linear model's prediction J Δθ */}
              {cur.err > 0.02 && <Arrow2 x1={wx(cur.tip[0])} y1={wy(cur.tip[1])} x2={wx(target[0])} y2={wy(target[1])} color="var(--m3)" width={2.4} />}
              {linPred && Math.hypot(linPred[0] - target[0], linPred[1] - target[1]) > 0.015 && <Arrow2 x1={wx(cur.tip[0])} y1={wy(cur.tip[1])} x2={wx(linPred[0])} y2={wy(linPred[1])} color="var(--pred)" width={2} dash="6 4" />}
              {cur.err > 0.06 && (
                <text className="kin-ik-note" x={(wx(cur.tip[0]) + wx(target[0])) / 2 + 6} y={(wy(cur.tip[1]) + wy(target[1])) / 2 - 6} style={{ fill: 'var(--m3)', fontWeight: 700 }}>
                  e
                </text>
              )}
            </g>

            {/* the guess (dashed) with its handles */}
            <path d={armD(guessPts)} fill="none" stroke="var(--accent)" strokeWidth={2.2} strokeDasharray="7 5" strokeLinecap="round" pointerEvents="none" />
            {guessPts.slice(1).map((p, h) => (
              <g
                key={`gh${h}`}
                className="kin-ik-handle"
                tabIndex={0}
                role="slider"
                aria-label={`Initial guess, joint ${h + 1} angle θ${h + 1} = ${fmt(guess[h], 3)} rad. Drag, or use the arrow keys.`}
                aria-valuenow={Number(guess[h].toFixed(3))}
                onPointerDown={(e) => startDrag({ kind: 'guess', h }, wsSvg.current, e)}
                onKeyDown={onGuessKey(h)}
              >
                <circle cx={wx(p[0])} cy={wy(p[1])} r={15} fill="transparent" />
                <circle cx={wx(p[0])} cy={wy(p[1])} r={6} fill="var(--surface)" stroke="var(--accent)" strokeWidth={2.5} />
              </g>
            ))}

            {/* target */}
            <g
              className="kin-ik-handle"
              tabIndex={0}
              role="slider"
              aria-label={`Target x_d at (${fmt(target[0], 3)}, ${fmt(target[1], 3)}) m. Drag, or use the arrow keys.`}
              aria-valuenow={Number(target[0].toFixed(3))}
              onPointerDown={(e) => startDrag({ kind: 'target' }, wsSvg.current, e)}
              onKeyDown={onTargetKey}
            >
              <circle cx={wx(target[0])} cy={wy(target[1])} r={17} fill="transparent" />
              <circle cx={wx(target[0])} cy={wy(target[1])} r={9} fill="none" stroke="var(--accent)" strokeWidth={2.5} />
              <path d={`M${wx(target[0]) - 13} ${wy(target[1])}H${wx(target[0]) + 13}M${wx(target[0])} ${wy(target[1]) - 13}V${wy(target[1]) + 13}`} stroke="var(--accent)" strokeWidth={1.6} />
              <text className="kin-ik-note" x={wx(target[0]) + (target[0] > 1.7 ? -13 : 13)} y={wy(target[1]) - 11} textAnchor={target[0] > 1.7 ? 'end' : 'start'} style={{ fill: 'var(--accent)', fontWeight: 700, fontStyle: 'italic' }}>
                x
                <tspan baselineShift="sub" style={{ fontSize: 9 }}>
                  d
                </tspan>
              </text>
            </g>
          </svg>
          <div className="kin-ik-legend" aria-hidden="true">
            <span>
              <i style={{ color: 'var(--text)' }} />
              iterate θ⁽ᵏ⁾
            </span>
            <span>
              <i className="dash" style={{ color: 'var(--accent)' }} />
              initial guess (drag)
            </span>
            <span>
              <i style={{ color: 'var(--m3)' }} />e = x_d − x(θ)
            </span>
            {showLin && (
              <>
                <span>
                  <i className="dash" style={{ color: 'var(--pred)' }} />
                  J Δθ (if ≠ e)
                </span>
                <span>
                  <i className="dot" style={{ color: 'var(--text-2)' }} />
                  real tip path this step
                </span>
              </>
            )}
            {showSols && (
              <span>
                <i style={{ color: 'var(--m1)', opacity: 0.5 }} />
                {nLinks === 2 ? 'exact solutions A, B' : 'some of the solutions'}
              </span>
            )}
          </div>
        </section>

        <section className="kin-ik-panel" aria-label="Joint space">
          <div className="kin-ik-panel-head">
            <h4>Joint space</h4>
            <span className="muted small">{nLinks === 3 ? 'θ₁, θ₂ shown (θ₃ hidden) · ' : ''}click or drag to set the guess</span>
          </div>
          <div className="kin-ik-cbox">
            <canvas ref={canvasRef} width={100} height={100} aria-hidden="true" style={{ display: showBasin ? undefined : 'none' }} />
            <svg
              ref={jsSvg}
              className="kin-ik-svg"
              viewBox={`0 0 ${JS.W} ${JS.H}`}
              tabIndex={0}
              role="slider"
              aria-label={`Joint space. The initial guess is at θ1 = ${fmt(wrapTau(guess[0]), 3)}, θ2 = ${fmt(wrapTau(guess[1]), 3)} rad. Arrow keys move it.`}
              aria-valuenow={Number(wrapTau(guess[0]).toFixed(3))}
              onPointerDown={onJsDown}
              onPointerMove={onJsMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              onKeyDown={onJsKey}
              style={{ cursor: 'crosshair' }}
            >
              <defs>
                <clipPath id="kin-ik-jsclip">
                  <rect x={JS.L} y={JS.T} width={JS.SZ} height={JS.SZ} />
                </clipPath>
              </defs>
              {PI_TICKS.map(([v, t]) => (
                <g key={t} pointerEvents="none">
                  <line className="kin-ik-grid" x1={jx(v)} x2={jx(v)} y1={JS.T} y2={JS.T + JS.SZ} />
                  <line className="kin-ik-grid" y1={jy(v)} y2={jy(v)} x1={JS.L} x2={JS.L + JS.SZ} />
                  <text className="kin-ik-tick" x={jx(v)} y={JS.T + JS.SZ + 15} textAnchor="middle">
                    {t}
                  </text>
                  <text className="kin-ik-tick" x={JS.L - 6} y={jy(v) + 4} textAnchor="end">
                    {t}
                  </text>
                </g>
              ))}
              <rect className="kin-ik-frame" x={JS.L} y={JS.T} width={JS.SZ} height={JS.SZ} />
              <text className="kin-ik-label" x={JS.L + JS.SZ / 2} y={JS.H - 6} textAnchor="middle">
                θ₁ (rad)
              </text>
              <text className="kin-ik-label" transform={`translate(18 ${JS.T + JS.SZ / 2}) rotate(-90)`} textAnchor="middle">
                θ₂ (rad)
              </text>
              <g clipPath="url(#kin-ik-jsclip)" pointerEvents="none">
                {nLinks === 2 && (
                  <>
                    <line x1={JS.L} x2={JS.L + JS.SZ} y1={jy(Math.PI)} y2={jy(Math.PI)} stroke="var(--bad)" strokeWidth={1.5} strokeDasharray="6 4" />
                    <text className="kin-ik-note" x={JS.L + JS.SZ - 4} y={jy(Math.PI) - 5} textAnchor="end" style={{ fill: 'var(--bad)' }}>
                      θ₂ = π: folded, det J = 0
                    </text>
                    <line x1={JS.L} x2={JS.L + JS.SZ} y1={jy(0) - 1} y2={jy(0) - 1} stroke="var(--bad)" strokeWidth={2.5} strokeDasharray="6 4" />
                    <line x1={JS.L} x2={JS.L + JS.SZ} y1={jy(TAU) + 1} y2={jy(TAU) + 1} stroke="var(--bad)" strokeWidth={2.5} strokeDasharray="6 4" />
                    <text className="kin-ik-note" x={JS.L + JS.SZ - 4} y={jy(TAU) + 15} textAnchor="end" style={{ fill: 'var(--bad)' }}>
                      θ₂ = 0 ≡ 2π: straight, det J = 0
                    </text>
                  </>
                )}
                {curveD.map((c, k) => (
                  <path key={`c${k}`} d={c.d} fill="none" stroke={c.branch === 0 ? 'var(--m1)' : 'var(--m2)'} strokeWidth={3} strokeLinecap="round" opacity={0.8} />
                ))}
                <path d={jsPath.smooth} fill="none" stroke="var(--text)" strokeWidth={2} strokeLinecap="round" />
                {jsPath.jumps.map((j, k) => (
                  <line key={`jj${k}`} x1={jx(j.a[0])} y1={jy(j.a[1])} x2={jx(j.b[0])} y2={jy(j.b[1])} stroke="var(--bad)" strokeWidth={2} strokeDasharray="3 4" />
                ))}
                {run.steps.slice(1, i).map((s, k) => (
                  <circle key={`it${k}`} cx={jx(wrapTau(s.theta[0]))} cy={jy(wrapTau(s.theta[1]))} r={2.6} fill="var(--text)" />
                ))}
              </g>
              <g pointerEvents="none">
                {sols.map((s, k) => (
                  <g key={`s${k}`}>
                    <circle cx={jx(s[0])} cy={jy(s[1])} r={7.5} fill={k === 0 ? 'var(--m1)' : 'var(--m2)'} stroke="var(--surface)" strokeWidth={2} />
                    <text x={jx(s[0])} y={jy(s[1]) + 4} textAnchor="middle" style={{ font: '700 10px var(--font)', fill: '#fff' }}>
                      {label(k)}
                    </text>
                  </g>
                ))}
                {i > 0 && <circle cx={jx(wrapTau(cur.theta[0]))} cy={jy(wrapTau(cur.theta[1]))} r={5} fill="var(--text)" stroke="var(--surface)" strokeWidth={1.5} />}
                <circle cx={jx(wrapTau(guess[0]))} cy={jy(wrapTau(guess[1]))} r={8} fill="var(--surface)" fillOpacity={0.6} stroke="var(--accent)" strokeWidth={2.6} />
                {(() => {
                  // the θ⁽⁰⁾ tag goes to whichever corner keeps it inside the plot and clear of the A/B markers and the iterate
                  const gx = jx(wrapTau(guess[0]));
                  const gy = jy(wrapTau(guess[1]));
                  const avoid = sols.map((s) => [jx(s[0]), jy(s[1])]);
                  if (i > 0) avoid.push([jx(wrapTau(cur.theta[0])), jy(wrapTau(cur.theta[1]))]);
                  const cands: [number, number, 'start' | 'end'][] = [
                    [11, -9, 'start'],
                    [-11, -9, 'end'],
                    [11, 20, 'start'],
                    [-11, 20, 'end'],
                  ];
                  let best = cands[0];
                  let bestScore = -Infinity;
                  for (const c of cands) {
                    const lx = gx + c[0] + (c[2] === 'start' ? 12 : -12);
                    const ly = gy + c[1] - 4;
                    const inside = lx > JS.L + 14 && lx < JS.L + JS.SZ - 14 && ly > JS.T + 10 && ly < JS.T + JS.SZ - 4;
                    const clear = Math.min(60, ...avoid.map(([ax, ay]) => Math.hypot(ax - lx, ay - ly)));
                    const score = clear + (inside ? 100 : 0);
                    if (score > bestScore) {
                      bestScore = score;
                      best = c;
                    }
                  }
                  return (
                    <text className="kin-ik-note" x={gx + best[0]} y={gy + best[1]} textAnchor={best[2]} style={{ fill: 'var(--accent)' }}>
                      θ⁽⁰⁾
                    </text>
                  );
                })()}
              </g>
            </svg>
          </div>
          <div className="kin-ik-legend" aria-hidden="true">
            {nLinks === 2 ? (
              <>
                <span>
                  <b className="sw" style={{ background: 'var(--m1)', opacity: 0.6 }} />
                  start here → A{solNames[0] ? ` (θ₂ > 0, ${solNames[0]})` : ''}
                </span>
                <span>
                  <b className="sw" style={{ background: 'var(--m2)', opacity: 0.6 }} />
                  start here → B{solNames[1] ? ` (θ₂ < 0, ${solNames[1]})` : ''}
                </span>
                <span>
                  <b className="sw" style={{ background: 'var(--text-3)', opacity: 0.4 }} />
                  no convergence in {MAX_ITER} steps
                </span>
                <span>stronger colour = fewer steps; speckles = chaos (a huge first step near det J = 0)</span>
              </>
            ) : (
              <>
                <span>
                  <i style={{ color: 'var(--m1)' }} />
                  solutions, θ₂ &gt; 0
                </span>
                <span>
                  <i style={{ color: 'var(--m2)' }} />
                  solutions, θ₂ &lt; 0
                </span>
                <span>a curve of solutions, not isolated points</span>
              </>
            )}
            <span>
              <i className="dot" style={{ color: 'var(--bad)' }} />
              jump ≥ π rad
            </span>
          </div>
        </section>
      </div>

      <div className="kin-ik-below">
        <section className="kin-ik-panel kin-ik-math" aria-live="polite">
          <MathPanel run={run} k={i} lambda={lambda} />
        </section>
        <section className="kin-ik-panel kin-ik-side">
          <h4>Error per iteration</h4>
          <ErrorPlot run={run} cmp={cmp} i={i} gap={out ? Math.hypot(target[0], target[1]) - R.outer : 0} />
          <Slider
            label="damping"
            tex="\lambda"
            tip="Damped least squares: Δθ = Jᵀ(JJᵀ + λ²I)⁻¹e. λ = 0 is plain Newton–Raphson; a bigger λ shortens every step, most of all near a singularity."
            value={lambda}
            min={0}
            max={0.5}
            step={0.01}
            unit="m"
            onChange={setLambda}
          />
          <Readouts min={120}>
            <Readout label="iteration k" text={`${i} / ${n}`} tip="Iterations shown so far / total (stops when ‖e‖ < 10⁻⁴ m or after 30)" />
            <Readout tex="\|e\|" value={cur.err} unit="m" tip="Distance from the tip to the target at this iterate" tone="m3" />
            <Readout tex="\|\Delta\theta\|" value={cur.dtheta ? Math.hypot(...cur.dtheta) : undefined} unit="rad" tip="Size of the step NR takes from this iterate" tone={cur.dtheta && Math.hypot(...cur.dtheta) > Math.PI ? 'bad' : undefined} />
            {nLinks === 2 ? (
              <Readout tex="\det J" value={cur.w} unit="m²" tip="det J = L₁L₂ sin θ₂: zero when the arm is straight or folded (a singularity)" tone={Math.abs(cur.w) < 0.1 ? 'bad' : undefined} />
            ) : (
              <Readout tex="\sigma_{\min}" value={cur.sigma[1]} unit="m" tip="Smallest singular value of J: zero at a singularity" tone={cur.sigma[1] < 0.1 ? 'bad' : undefined} />
            )}
          </Readouts>
          <div className="row gap-s" style={{ flexWrap: 'wrap' }}>
            <Toggle checked={showSols} onChange={setShowSols} label={nLinks === 2 ? 'Show both exact solutions' : 'Show a fan of solutions'} />
            <Toggle checked={showLin} onChange={setShowLin} label="Show J Δθ and the real tip path" />
          </div>
        </section>
      </div>

      <PredictBlock api={api} />

      <More label="How to do one Newton–Raphson step by hand (and the 6-D version in the notes)">
        <Rich
          text={`For a planar 2-link arm with $\\theta_1$ from the $x$-axis and $\\theta_2$ relative to link 1:

$$x(\\theta) = \\begin{bmatrix} L_1 \\cos\\theta_1 + L_2\\cos(\\theta_1+\\theta_2) \\\\ L_1 \\sin\\theta_1 + L_2\\sin(\\theta_1+\\theta_2) \\end{bmatrix}, \\qquad J(\\theta) = \\begin{bmatrix} -L_1 s_1 - L_2 s_{12} & -L_2 s_{12} \\\\ L_1 c_1 + L_2 c_{12} & L_2 c_{12} \\end{bmatrix}$$

1. Error: $e = x_d - x(\\theta^{(k)})$.
2. Jacobian at the current guess, and $\\det J = L_1 L_2 \\sin\\theta_2$ (zero when the arm is straight or folded: a singularity).
3. Step: $\\Delta\\theta = J^{-1} e$ with $J^{-1} = \\frac{1}{\\det J}\\begin{bmatrix} J_{22} & -J_{12} \\\\ -J_{21} & J_{11}\\end{bmatrix}$, in **radians**.
4. Update $\\theta^{(k+1)} = \\theta^{(k)} + \\Delta\\theta$ and repeat until $\\|e\\|$ is small.

**Why it works and when it fails.** Each step replaces the arm by its linearisation $x(\\theta + \\Delta\\theta) \\approx x(\\theta) + J\\Delta\\theta$ and solves that exactly. The real tip moves on arcs, so it misses a little; close to a solution the miss shrinks quadratically (the error roughly squares each step: 10⁻², 10⁻⁴, 10⁻⁸). Far away, the linear model is poor and it can go anywhere. Near $\\det J = 0$, $J^{-1}$ is huge, so the steps blow up. **Damped least squares** $\\Delta\\theta = J^T(JJ^T + \\lambda^2 I)^{-1}e$ caps them, at the price of slower final convergence. With more joints than task coordinates (redundant), $J^\\dagger = J^T(JJ^T)^{-1}$ gives the smallest step that does the job.

**The notes' 6-D version** (summary notes §6) is the same loop on poses: guess $\\theta^0$; error twist $\\mathcal{V}_b = \\log\\big(T_{sb}(\\theta)^{-1}T_{sd}\\big)$; update $\\theta \\leftarrow \\theta + J_b^\\dagger(\\theta)\\,\\mathcal{V}_b$; repeat until $\\|\\omega_b\\|$ and $\\|v_b\\|$ are small. It only converges from a good guess, may find a different solution from the one you wanted, and struggles near singularities (2022 Q12: "always converges" is **false**).`}
        />
        <div className="row gap-s" style={{ marginTop: 8 }}>
          <LinkButton href={href(['kin', 'solve', 'kin-nr-step'], { t: 2 })} variant="primary">
            Practise: one Newton–Raphson step by hand
          </LinkButton>
          <LinkButton href={href(['kin', 'solve', 'kin-ik-solutions'], { t: 1 })}>How many IK solutions?</LinkButton>
        </div>
      </More>
    </div>
  );
}

// ------------------------------------------------------------------ pieces

function Arrow2({ x1, y1, x2, y2, color, width = 2, dash }: { x1: number; y1: number; x2: number; y2: number; color: string; width?: number; dash?: string }) {
  const L = Math.hypot(x2 - x1, y2 - y1);
  if (L < 1) return null;
  const ux = (x2 - x1) / L;
  const uy = (y2 - y1) / L;
  const h = Math.min(9, L * 0.45);
  const bx = x2 - ux * h;
  const by = y2 - uy * h;
  return (
    <g pointerEvents="none">
      <line x1={x1} y1={y1} x2={bx} y2={by} stroke={color} strokeWidth={width} strokeDasharray={dash} strokeLinecap="round" />
      <path d={`M${x2} ${y2}L${bx - uy * h * 0.5} ${by + ux * h * 0.5}L${bx + uy * h * 0.5} ${by - ux * h * 0.5}Z`} fill={color} />
    </g>
  );
}

/** Values that follow the inputs at most every `ms` (the first change after a pause is immediate). */
function useThrottledTuple<T extends readonly unknown[]>(vals: T, ms: number): T {
  const [v, setV] = useState(vals);
  const last = useRef(0);
  const timer = useRef(0);
  useEffect(() => {
    const wait = last.current + ms - performance.now();
    if (wait <= 0) {
      last.current = performance.now();
      setV(vals);
      return;
    }
    timer.current = window.setTimeout(() => {
      last.current = performance.now();
      setV(vals);
    }, wait);
    return () => window.clearTimeout(timer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...vals, ms]);
  return v;
}

/** KaTeX is the costly part of a drag frame, so the numbers panel refreshes at most ~8 times a second. */
const MathPanel = memo(function MathPanel({ run, k, lambda }: { run: NrRun; k: number; lambda: number }) {
  const [r, kk, l] = useThrottledTuple([run, k, lambda] as const, 120);
  return <StepMath run={r} k={Math.min(kk, r.steps.length - 1)} lambda={l} />;
});

/** The numbers of the current Newton–Raphson step (memoised: only re-renders on a new run or step). */
const StepMath = memo(function StepMath({ run, k, lambda }: { run: NrRun; k: number; lambda: number }) {
  const s = run.steps[k];
  const n = run.lengths.length;
  const last = !s.dtheta;
  const th = s.theta;
  const damped = lambda > 0;
  const inv = n === 2 && !damped ? 'J^{-1}' : damped ? 'J^{\\dagger}_{\\lambda}' : 'J^{\\dagger}';
  const fk =
    n === 2
      ? 'x(\\theta) = \\begin{bmatrix} L_1 c_1 + L_2 c_{12} \\\\ L_1 s_1 + L_2 s_{12} \\end{bmatrix}'
      : 'x(\\theta) = \\begin{bmatrix} L_1 c_1 + L_2 c_{12} + L_3 c_{123} \\\\ L_1 s_1 + L_2 s_{12} + L_3 s_{123} \\end{bmatrix}';
  const invDef =
    n === 2 && !damped
      ? `${inv} = \\frac{1}{\\det J}\\begin{bmatrix} J_{22} & -J_{12} \\\\ -J_{21} & J_{11} \\end{bmatrix} = ${matTeX(s.Jp)}`
      : damped
        ? `${inv} = J^T\\big(JJ^T + \\lambda^2 I\\big)^{-1} = ${matTeX(s.Jp)}, \\quad \\lambda = ${tex(lambda, 3)}\\text{ m}`
        : `${inv} = J^T\\big(JJ^T\\big)^{-1} = ${matTeX(s.Jp)}`;
  const det = n === 2 ? `\\det J = L_1 L_2 \\sin\\theta_2 = ${tex(s.w, 4)}\\ \\text{m}^2` : `\\sigma_{\\min}(J) = ${tex(s.sigma[1], 4)}\\ \\text{m}`;
  return (
    <>
      <h4>{last ? `Iteration ${k}: the last one` : `Iteration ${k} → ${k + 1}`}</h4>
      <TeX display>{`\\theta^{(${k})} = ${vecTeX(th)}\\ \\text{rad}, \\qquad ${fk.replace('x(\\theta)', `x(\\theta^{(${k})})`)} = ${vecTeX(s.tip)}\\ \\text{m}`}</TeX>
      <TeX display>{`e = x_d - x(\\theta^{(${k})}) = ${vecTeX(run.target)} - ${vecTeX(s.tip)} = ${vecTeX(s.e)}\\ \\text{m}, \\qquad \\|e\\| = ${tex(s.err, 3)}\\ \\text{m}`}</TeX>
      {last ? (
        <Rich
          className="kin-ik-explain"
          text={
            run.converged
              ? `Stop: $\\|e\\| < 10^{-4}$ m. The joint angles are $\\theta = ${vecTeX(th.map(wrapTau))}$ rad (wrapped to $[0, 2\\pi)$).`
              : `Stop: ${MAX_ITER} iterations without reaching $\\|e\\| < 10^{-4}$ m. ${run.steps.some((x) => Math.abs(x.w) < 0.05) ? 'The iterates kept passing close to a singularity.' : ''}`
          }
        />
      ) : (
        <>
          <TeX display>{`J(\\theta^{(${k})}) = ${matTeX(s.J)}\\ \\tfrac{\\text{m}}{\\text{rad}}, \\qquad ${det}`}</TeX>
          <TeX display>{invDef}</TeX>
          <TeX display>{`\\Delta\\theta = ${inv}\\, e = ${vecTeX(s.dtheta!)}\\ \\text{rad}, \\qquad \\theta^{(${k + 1})} = \\theta^{(${k})} + \\Delta\\theta = ${vecTeX(th.map((t, m) => t + s.dtheta![m]))}\\ \\text{rad}`}</TeX>
        </>
      )}
    </>
  );
});

const ErrorPlot = memo(function ErrorPlot({ run, cmp, i, gap }: { run: NrRun; cmp: NrRun | null; i: number; gap: number }) {
  const xmax = Math.max(8, run.steps.length - 1, cmp ? Math.min(MAX_ITER, cmp.steps.length - 1) : 0);
  const pts = run.steps.map((s) => [s.k, Math.max(1e-9, s.err)] as const);
  const cpts = cmp ? cmp.steps.map((s) => [s.k, Math.max(1e-9, s.err)] as const) : null;
  return (
    <Plot
      x={{ min: 0, max: xmax, label: 'iteration k' }}
      y={{ min: 1e-7, max: 10, log: true, label: '‖e‖ (m)' }}
      height={200}
      cursorX={i}
      ariaLabel="Error norm per iteration on a log scale"
    >
      <HLine y={TOL} label="tolerance 10⁻⁴ m" color="var(--ok)" />
      {gap > 0 && <HLine y={gap} label="closest reachable" color="var(--bad)" />}
      {cpts && <Line points={cpts} color="var(--text-3)" width={1.8} dash />}
      <Line points={pts} color="var(--m3)" width={2.4} />
      {pts.map(([k, e]) => (
        <PlotDot key={k} x={k} y={e} on={k === i} />
      ))}
    </Plot>
  );
});

function PlotDot({ x, y, on }: { x: number; y: number; on: boolean }) {
  const { sx, sy, y0, ih } = usePlot();
  const py = sy(y);
  if (py > y0 + ih + 2) return null;
  return <circle cx={sx(x)} cy={py} r={on ? 5 : 3} fill={on ? 'var(--m3)' : 'var(--surface)'} stroke="var(--m3)" strokeWidth={1.8} pointerEvents="none" />;
}

// ------------------------------------------------------------------ predict-then-reveal (memoised)

const PredictBlock = memo(function PredictBlock({ api }: { api: MutableRefObject<Record<string, () => void>> }) {
  return (
    <div className="kin-ik-predicts">
      <PredictReveal
        id="kin-ik-elbow"
        question="From the first scenario’s guess, Newton–Raphson reaches solution A ($\theta_2 > 0$). Keep the target, but start from the mirror-image guess ($\theta_2 \to -\theta_2$). Where does it end up?"
        options={['At A again: the target decides the answer', 'At solution B: the other elbow', 'Nowhere: it oscillates between A and B']}
        answer={1}
        explain="Each step only uses the slope of the arm **at the current guess**, so Newton–Raphson slides into the solution whose basin it starts in. A guess bent the other way sits in B’s basin (orange) and converges to the other elbow. The target has two valid answers; the guess picks one. That is why numerical IK needs a good initial guess, e.g. the robot’s current pose."
        tryIt="press Show me and watch the joint-space dot run to B."
        onApply={() => api.current.elbow()}
      />
      <PredictReveal
        id="kin-ik-outside"
        question="The target is moved to 1.84 m from the base, beyond the reach $L_1 + L_2$ = 1.7 m. What does $\|e\|$ do as Newton–Raphson iterates?"
        options={['It falls to the tolerance, only more slowly', 'It falls to zero once the arm is fully stretched', 'It stays above 0.14 m, the gap to the reach circle']}
        answer={2}
        explain="No joint angles put the tip there, so no solution exists and $\|e\|$ can never drop below $|x_d| - (L_1 + L_2)$ ≈ 0.14 m. Undamped, it does worse than stall: every time the arm nearly straightens, $\det J \to 0$ and the next step is thrown far away, so the error thrashes. With $\lambda$ ≈ 0.3 m it settles, stretched straight towards the target, at that floor (2022 Q4: a redundant arm still has **no** solution out of reach)."
        tryIt="press Show me, then drag λ up to 0.3 m and compare the two error curves."
        onApply={() => api.current.outside()}
      />
      <PredictReveal
        id="kin-ik-stretch"
        question="The guess is almost straight: $\theta_2$ = 0.03 rad, so $\det J = L_1L_2\sin\theta_2 \approx$ 0.021 m². The target is inside the workspace and $\lambda = 0$. How big is the first step $\Delta\theta = J^{-1}e$?"
        options={['Huge: tens of radians', 'About right: it lands near the solution', 'Tiny: the arm barely moves']}
        answer={0}
        explain="$J^{-1} = \frac{1}{\det J}(\ldots)$, and $1/\det J \approx 48$ m⁻². The error has a component along the arm (the target is nearer the base than the straight tip), which a straight arm can hardly produce, so the step is enormous: here $\|\Delta\theta\| \approx 52$ rad. Exactly at $\theta_2 = 0$ that direction is impossible; a singularity is where the Jacobian loses rank (2022 Q21). It converges afterwards only by luck."
        tryIt="press Show me: read Δθ in the numbers panel and watch the dotted tip path spiral."
        onApply={() => api.current.stretch()}
      />
      <PredictReveal
        id="kin-ik-damp"
        question="Same nearly straight start, but now with damping $\lambda$ = 0.2 m: $\Delta\theta = J^T(JJ^T + \lambda^2 I)^{-1}e$. Compared with $\lambda = 0$…"
        options={['Every step is exactly the same as before', 'It can no longer converge at all', 'The steps stay small and it converges smoothly']}
        answer={2}
        explain="The $\lambda^2 I$ term keeps $JJ^T + \lambda^2 I$ invertible, so the step stays small when $\det J$ is tiny: $\|\Delta\theta\| \approx 0.21$ rad instead of 52. Away from singularities $\lambda$ barely matters. The price: near the solution damped steps fall slightly short, so the last iterations are slower (compare the solid and dashed error curves)."
        tryIt="press Show me: λ = 0.2 m (solid) against λ = 0 (dashed) in the error plot."
        onApply={() => api.current.damp()}
      />
      <PredictReveal
        id="kin-ik-redundant"
        question="A planar 3-link arm must put its **tip** (2 coordinates) on a reachable target. How many joint configurations do it?"
        options={['Two, like the 2-link arm (elbow up, elbow down)', 'Infinitely many: a whole curve of them', 'Exactly one']}
        answer={1}
        explain="Three joints, two equations: one degree of freedom is left over, so the solutions form a curve (self-motion: the arm can move while the tip stays put). Newton–Raphson with the pseudoinverse lands on whichever point of that curve is nearest its guess. Any redundant arm has infinitely many solutions inside its workspace (2022 Q18), and none outside it (2022 Q4)."
        tryIt="press Show me: the faint arms all reach the target; drag the guess and watch NR land on a different one."
        onApply={() => api.current.redundant()}
      />
    </div>
  );
});
