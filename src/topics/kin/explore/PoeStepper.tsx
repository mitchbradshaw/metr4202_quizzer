// Product of exponentials, one factor at a time (summary notes §6; Modern Robotics ch. 4; 2022 Q34).
// Start at M and apply the factors with animation. Space form T = e^[S1]θ1 ⋯ e^[Sn]θn M is built from M leftwards:
// every new factor multiplies from the left, a motion about an axis FIXED in {s}, so the last joint must go first
// (S_i is joint i's axis only while joints 1 … i−1 are still at zero). Body form T = M e^[B1]θ1 ⋯ e^[Bn]θn is built
// rightwards: every axis rides with {b}, so the first joint goes first. Each factor moves everything distal (tinted).
// The 4 × 4 matrices are shown at every step, both forms end at the same T(θ), and the wrong order (e^[S1]θ1 first
// about fixed axes) visibly tears the arm apart.
import { memo, useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import type { ExploreItem } from '../../../engine/types';
import { armM, armScrewsS, expScrew, fkBody, fkSpace, linVecEval, matMul, partialSpace, posOf, rotOf, type ArmSpec, type Mat4, type Vec3 } from '../../../core/kin';
import { Button, Callout, More, Segmented, Slider } from '../../../ui/kit';
import { PredictReveal } from '../../../ui/PredictReveal';
import { Rich, TeX } from '../../../ui/Rich';
import { usePrefersReducedMotion } from '../../../anim/hooks';
import { AxisLegend, ArmPicker, Kin3DView, ViewBar, ease, revealView, triad, triadLabels, useArmChoice, useTween, type ArmRenderer, type Extra, type Label, type ViewMode } from './kin3dScene';
import {
  DEG,
  armBounds,
  axisSpan,
  axisTagAt,
  bodyTears,
  defaultPoeTheta,
  factorTeX,
  matTeX,
  maxDiff,
  numTeX,
  poeJointAt,
  poePose,
  poeSegments,
  poeStepOf,
  poeSteps,
  productTeX,
  triadTips,
  valuesText,
  vecNumTeX,
  wrongOrderBodies,
  wrongStepStatus,
  type PoeForm,
} from './kin3dMath';

export const meta: Omit<ExploreItem, 'component'> = {
  id: 'poe',
  title: 'Product of exponentials, one factor at a time',
  summary:
    'Start at $M$ and apply the factors one by one, with the 4 × 4 matrix at every step: the space form $e^{[S_1]\\theta_1}\\cdots e^{[S_n]\\theta_n}M$ from the right (last joint first, axes fixed in {s}) or the body form $Me^{[B_1]\\theta_1}\\cdots e^{[B_n]\\theta_n}$ from the left (first joint first, axes riding with {b}).',
  notice:
    'Each factor moves everything after its joint. Space form: the axes stay fixed in {s}, so the last joint must move first. Body form: the axes ride with {b}, so the first joint moves first. Both end at the same $T(\\theta)$.',
  minutes: 8,
};

interface PoeApi {
  firstStep?: () => void;
  wrong?: () => void;
  bodyRide?: () => void;
}
type ApiKey = keyof PoeApi;

const I3 = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];
const MS_PER_FACTOR = 1050;
/** 2022 Q34: θ = (−π/2, π, π/2, −h) for the RRRP arm, with h = 0.3 m. */
const Q34 = [-90 * DEG, 180 * DEG, 90 * DEG, -0.3];

export default function PoeStepper() {
  const choice = useArmChoice('rrrrr-2025');
  const [form, setForm] = useState<PoeForm>('s');
  const [mode, setMode] = useState<ViewMode>('exam');
  const api = useRef<PoeApi>({});
  const root = useRef<HTMLDivElement>(null);
  const reveal = useCallback(() => revealView(root.current), []);
  return (
    <div className="kin3d" ref={root}>
      <div className="kin3d-toolbar">
        <ArmPicker choice={choice} />
        <Segmented
          label="Form of the product"
          value={form}
          onChange={setForm}
          options={[
            { value: 's', label: 'Space form', title: 'T = e^[S1]θ1 ⋯ e^[Sn]θn M: axes fixed in {s}, built from M leftwards' },
            { value: 'b', label: 'Body form', title: 'T = M e^[B1]θ1 ⋯ e^[Bn]θn: axes fixed in {b}, built from M rightwards' },
          ]}
        />
        <span className="kin3d-sub">{choice.arm.source}</span>
      </div>
      <PoeInner key={choice.arm.id} arm={choice.arm} vals={choice.vals} form={form} setForm={setForm} mode={mode} setMode={setMode} api={api} />
      <PredictBlock api={api} reveal={reveal} />
      <More label="Why the order matters, and what one factor is (Modern Robotics ch. 4; summary notes §6)">
        <Rich
          text={`1. **Space form, read from $M$ outwards:** $T = e^{[S_1]\\theta_1}\\Big(e^{[S_2]\\theta_2}\\big(\\cdots\\big(e^{[S_n]\\theta_n}M\\big)\\big)\\Big)$. Multiplying from the **left** moves a pose about an axis **fixed in {s}**. $S_i$ is joint $i$'s axis at $\\theta = 0$, so it is joint $i$'s real axis only while joints $1, \\dots, i-1$ are still at zero: that is why the factor next to $M$ (the last joint) goes first.
2. **Every factor moves everything distal.** $e^{[S_i]\\theta_i}$ multiplies the whole product to its right: joint $i$'s link, every later joint and {b}. Joints before $i$ are not in that product, so they stay put.
3. **Body form, read from $M$ outwards:** $T = \\Big(\\big(Me^{[B_1]\\theta_1}\\big)e^{[B_2]\\theta_2}\\Big)\\cdots$. Multiplying from the **right** moves about an axis written in the moving frame {b}, so the $B_i$ ride with the end-effector. $B_i = [\\mathrm{Ad}_{M^{-1}}]S_i$ is joint $i$ seen from {b} at $\\theta = 0$; it stays right while joints $i+1, \\dots, n$ are at zero, so the first joint goes first.
4. **Same answer:** $Me^{[B_i]\\theta_i}M^{-1} = e^{M[B_i]M^{-1}\\theta_i} = e^{[S_i]\\theta_i}$, so sliding $M$ from the right end to the left turns every $B_i$ into $S_i$: the two forms are one product written two ways.
5. **One factor:** $e^{[S]\\theta} = \\begin{bmatrix} e^{[\\omega]\\theta} & \\big(I\\theta + (1-\\cos\\theta)[\\omega] + (\\theta-\\sin\\theta)[\\omega]^2\\big)v \\\\ 0 & 1 \\end{bmatrix}$ with Rodrigues' $e^{[\\omega]\\theta} = I + \\sin\\theta\\,[\\omega] + (1-\\cos\\theta)[\\omega]^2$; a prismatic joint gives $\\begin{bmatrix} I & v\\theta \\\\ 0 & 1 \\end{bmatrix}$.
6. **In the exam** the marks are for $M$ and the screw-axis table; the product is rarely multiplied out by hand, but 2022 Q34 asks for $T(\\theta)$ at a pose. Choose the 2022 RRRP arm and press **2022 Q34 pose** to watch it.`}
        />
      </More>
    </div>
  );
}

function PoeInner({
  arm,
  vals,
  form,
  setForm,
  mode,
  setMode,
  api,
}: {
  arm: ArmSpec;
  vals: Record<string, number>;
  form: PoeForm;
  setForm: (f: PoeForm) => void;
  mode: ViewMode;
  setMode: (m: ViewMode) => void;
  api: MutableRefObject<PoeApi>;
}) {
  const n = arm.joints.length;
  const [r, setR] = useState<ArmRenderer | null>(null);
  const [theta, setTheta] = useState<number[]>(() => defaultPoeTheta(arm));
  /** Factors applied so far (whole steps). */
  const [k, setK] = useState(0);
  /** Build step being animated (1 … n), or null when idle. */
  const [moving, setMoving] = useState<number | null>(null);
  const [wrong, setWrong] = useState(false);
  /** A factor put in the spotlight by a prediction (e.g. the next one), until the next action. */
  const [focus, setFocus] = useState<number | null>(null);
  const tween = useTween();
  const reduced = usePrefersReducedMotion();
  const sRef = useRef(0);
  const target = useRef(0);
  const wrongRef = useRef(false);
  const pending = useRef<ApiKey | null>(null);
  const fitted = useRef(false);

  const bounds = useMemo(() => armBounds(arm, vals), [arm, vals]);
  const u = bounds.size;
  const M = useMemo(() => armM(arm, vals), [arm, vals]);
  const S = useMemo(() => armScrewsS(arm, vals), [arm, vals]);
  const qs = useMemo(() => arm.joints.map((j) => linVecEval(j.q, vals)), [arm, vals]);
  const steps = useMemo(() => poeSteps(M, S, theta, form), [M, S, theta, form]);
  const T = steps.running[n];
  const Tspace = useMemo(() => fkSpace(M, S, theta), [M, S, theta]);
  const Tbody = useMemo(() => fkBody(M, steps.B, theta), [M, steps.B, theta]);
  const wrongRun = useMemo(() => {
    const out: Mat4[] = [M];
    S.forEach((s, i) => out.push(matMul(expScrew(s, theta[i]), out[i])));
    return out;
  }, [M, S, theta]);

  // the factor in the spotlight: the one moving, else one a prediction points at, else the one just applied
  // (or the first one, at M)
  const active = moving ?? focus ?? (k === 0 ? 1 : k);
  const jointOfStep = (step: number) => (wrong ? step - 1 : poeJointAt(n, step, form));
  const activeJoint = active === null ? null : jointOfStep(active);

  // --- pose
  const show = (s: number, w = wrongRef.current) => {
    sRef.current = s;
    if (!r) return;
    if (w) r.setBodies(wrongOrderBodies(S, theta, s));
    else r.setPose(poePose(theta, s, form));
  };
  const showRef = useRef(show);
  showRef.current = show;

  const goTo = (to: number, opts: { wrong?: boolean; ms?: number; focusAfter?: number } = {}) => {
    const w = opts.wrong ?? wrongRef.current;
    target.current = to;
    setFocus(null);
    const segs = poeSegments(sRef.current, to);
    if (!segs.length) {
      tween.stop();
      setMoving(null);
      setK(Math.round(to));
      return;
    }
    const per = reduced ? 1 : opts.ms ?? MS_PER_FACTOR;
    const lens = segs.map(([a, b]) => Math.abs(b - a));
    const total = lens.reduce((x, y) => x + y, 0);
    let lastMove = -1;
    let lastK = -1;
    tween.run(
      Math.max(1, total * per),
      (t) => {
        let el = t * total;
        let i = 0;
        while (i < segs.length - 1 && el > lens[i]) {
          el -= lens[i];
          i++;
        }
        const [a, b] = segs[i];
        const f = lens[i] > 0 ? Math.min(1, el / lens[i]) : 1;
        show(a + (b - a) * ease(f), w);
        const factor = b > a ? Math.floor(a + 1e-9) + 1 : Math.ceil(a - 1e-9);
        if (factor !== lastMove) {
          lastMove = factor;
          setMoving(factor);
        }
        const reached = f >= 1 ? Math.round(b) : b > a ? Math.floor(a + 1e-9) : Math.ceil(a - 1e-9);
        if (reached !== lastK) {
          lastK = reached;
          setK(reached);
        }
      },
      () => {
        setMoving(null);
        setK(Math.round(to));
        if (opts.focusAfter !== undefined) setFocus(opts.focusAfter);
      }
    );
  };

  const resetTo = (w: boolean) => {
    tween.stop();
    wrongRef.current = w;
    setWrong(w);
    setMoving(null);
    setFocus(null);
    setK(0);
    target.current = 0;
    show(0, w);
  };

  // --- scene
  useEffect(() => {
    if (!r) return;
    r.setArm(arm, vals);
    r.setView(mode);
    r.setGhost(arm.joints.map(() => 0));
    fitted.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r, arm, vals]);
  // a new form starts again from M (and leaves the wrong-order demo)
  const firstForm = useRef(true);
  useEffect(() => {
    if (firstForm.current) {
      firstForm.current = false;
      return;
    }
    resetTo(false);
    const a = pending.current;
    if (a) {
      pending.current = null;
      window.setTimeout(() => api.current[a]?.(), 30);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form]);
  // the pose follows θ (and the renderer once it exists)
  useEffect(() => {
    showRef.current(sRef.current);
  }, [r, theta, form, S]);
  useEffect(() => {
    if (!r) return;
    r.setHighlight(activeJoint);
    r.setMoving(activeJoint === null ? null : activeJoint + 1);
  }, [r, activeJoint]);
  // keep the poses this form passes through (and the wrong order's, while it is shown) inside the exam view
  useEffect(() => {
    if (!r) return;
    const first = !fitted.current;
    const id = window.setTimeout(() => {
      const sets: Mat4[][] = [];
      for (let s = 0; s <= n + 1e-9; s += 0.5) sets.push(wrong ? wrongOrderBodies(S, theta, s) : partialSpace(S, poePose(theta, s, form)));
      r.fitBodies(sets, [], first ? 0 : 420);
      fitted.current = true;
    }, first ? 0 : 260);
    return () => window.clearTimeout(id);
  }, [r, S, theta, n, wrong, form]);

  useEffect(() => {
    if (!r) return;
    const ex: Extra[] = [];
    const lb: Label[] = [];
    const tl = 0.26 * u;
    const p = linVecEval(arm.p, vals);
    ex.push(...triad([0, 0, 0], I3, tl, 0), ...triad(p, arm.R, tl, n));
    lb.push(...triadLabels('s', [0, 0, 0], I3, tl, 's'), ...triadLabels('b', p, arm.R, tl, 'b', n));
    // where {b} has to end up: T(θ)
    const Tp = posOf(T);
    const TR = rotOf(T);
    ex.push(...triad(Tp, TR, tl * 0.85, 0, 0.3, 0.007 * u));
    lb.push({ key: 'T', tex: 'T(\\theta)', at: Tp, from: [Tp[0] + (TR[0][0] + TR[0][1] + TR[0][2]) * tl, Tp[1] + (TR[1][0] + TR[1][1] + TR[1][2]) * tl, Tp[2] + (TR[2][0] + TR[2][1] + TR[2][2]) * tl], cls: 'is-small', color: 'var(--text-2)' });
    // the screw axes: fixed in {s} (space form) or riding with {b} (body form)
    const tips = triadTips(arm, vals, tl);
    const body = form === 's' || wrong ? 0 : n;
    const letter = form === 's' || wrong ? 'S' : 'B';
    arm.joints.forEach((j, i) => {
      const step = wrong ? i + 1 : poeStepOf(n, i, form);
      const now = step === active;
      const done = step <= k;
      const op = now ? 1 : done ? 0.25 : 0.5;
      const q = qs[i];
      const w = j.axis;
      const tag = `${letter}_{${i + 1}}`;
      if (j.type === 'R') {
        const span = axisSpan(bounds.pts, q, w, 0.2 * u);
        ex.push({ kind: 'axis', q, w, span, color: '--accent', opacity: op, body, r: now ? 0.0085 * u : undefined });
        lb.push({ key: `ax${i}`, tex: tag, at: axisTagAt(q, w, span, tips, 0.14 * u, 0.07 * u), from: q, body, cls: now ? 'is-tag' : 'is-small is-dim', color: 'var(--accent)' });
        if (now) {
          const sg = theta[i] < 0 ? -1 : 1;
          ex.push({ kind: 'arc', at: q, w: [sg * w[0], sg * w[1], sg * w[2]], r: r.jr * 2.1, color: '--accent', body });
          ex.push({ kind: 'point', at: q, color: '--accent', r: 0.02 * u, body });
        }
      } else {
        const len = 0.38 * u;
        ex.push({ kind: 'arrow', from: q, dir: w, len, color: '--accent', opacity: op, body, r: (now ? 0.009 : 0.006) * u });
        lb.push({ key: `ax${i}`, tex: tag, at: [q[0] + w[0] * len, q[1] + w[1] * len, q[2] + w[2] * len], from: q, body, cls: now ? 'is-tag' : 'is-small is-dim', color: 'var(--accent)' });
      }
    });
    if (wrong && k > 0) {
      const W = wrongOrderBodies(S, theta, k);
      bodyTears(W, S, poePose(theta, k, 'b'), qs).forEach((t) => {
        if (t.gap < 0.02 * u) return;
        ex.push({ kind: 'dash', from: t.at, to: t.to, color: '--bad' }, { kind: 'point', at: t.at, color: '--bad', r: 0.017 * u }, { kind: 'point', at: t.to, color: '--bad', r: 0.017 * u });
        lb.push({ key: `tear${t.joint}`, tex: `\\text{torn at joint ${t.joint + 1}}`, at: [(t.at[0] + t.to[0]) / 2, (t.at[1] + t.to[1]) / 2, (t.at[2] + t.to[2]) / 2], color: 'var(--bad)', cls: 'is-tag' });
      });
    }
    r.setExtras(ex);
    r.setLabels(lb);
  }, [r, arm, vals, n, u, bounds, qs, S, T, wrongRun, theta, form, k, active, wrong]);

  // --- predictions
  const need = (f: PoeForm, a: ApiKey) => {
    if (form === f) return true;
    pending.current = a;
    setForm(f);
    return false;
  };
  api.current.firstStep = () => {
    if (!need('s', 'firstStep')) return;
    resetTo(false);
    sRef.current = 0;
    goTo(n);
  };
  api.current.wrong = () => {
    if (!need('s', 'wrong')) return;
    resetTo(true);
    goTo(n, { wrong: true, ms: MS_PER_FACTOR * 1.15 });
  };
  api.current.bodyRide = () => {
    if (!need('b', 'bodyRide')) return;
    resetTo(false);
    goTo(1, { focusAfter: 2 });
  };

  // --- controls
  const setOne = (i: number, v: number) => {
    tween.stop();
    setMoving(null);
    setFocus(null);
    sRef.current = k;
    setTheta((t) => t.map((x, j) => (j === i ? v : x)));
  };
  const setAll = (th: number[]) => {
    tween.stop();
    setMoving(null);
    setFocus(null);
    sRef.current = k;
    setTheta(th);
  };
  const back = () => goTo(Math.max(0, Math.ceil(sRef.current - 1e-6) - 1));
  const forward = () => goTo(Math.min(n, Math.floor((tween.active ? target.current : sRef.current) + 1e-6) + 1));
  const playPause = () => {
    if (tween.active) {
      tween.stop();
      // paused part-way through a factor: keep that factor in the spotlight
      const s = sRef.current;
      setMoving(Math.abs(s - Math.round(s)) > 1e-6 ? Math.floor(s) + 1 : null);
      return;
    }
    if (k >= n) {
      show(0);
      setK(0);
    }
    goTo(n);
  };
  const isQ34 = arm.id === 'rrrp-2022' && theta.every((x, i) => Math.abs(x - Q34[i]) < 1e-9);

  // --- words for the current step
  const stepWords = (): string => {
    const shown = moving ?? k;
    if (wrong) {
      if (shown === 0) return 'Wrong order: start at $M$ and apply $e^{[S_1]\\theta_1}$ first, then each later factor about its axis **fixed** in {s}.';
      const j = shown - 1;
      const st = wrongStepStatus(S, theta, qs, j, 0.02 * u);
      const J = j + 1;
      return `**Wrong order, factor ${shown} of ${n}: $${factorTeX('s', j)}$** about the fixed axis $S_{${J}}$. ${
        j === 0
          ? 'This one is still right: nothing has moved yet, so $S_1$ is where joint 1 is.'
          : st === 'off'
            ? `The earlier factors have carried joint ${J} off the fixed line $S_{${J}}$, so the links after it swing about a line that misses the joint: the arm tears apart there (red).`
            : st === 'tilted'
              ? `Joint ${J} is still on the line, but the earlier factors have turned its axis, so the fixed $S_{${J}}$ points the wrong way and the links after it go somewhere joint ${J} cannot take them.`
              : `The earlier factors happen to leave joint ${J}'s axis where $S_{${J}}$ says, so this factor is harmless.`
      }`;
    }
    if (!moving && focus !== null && focus > k) {
      const j = poeJointAt(n, focus, form);
      const J = j + 1;
      return `**Next: factor ${focus} of ${n}, $${factorTeX(form, j)}$.** ${
        form === 's'
          ? J > 1
            ? `Its axis $S_{${J}}$ is still exactly where joint ${J} is, because joints 1–${J - 1} have not moved yet.`
            : 'Joint 1 never moves, so $S_1$ is always where it is.'
          : `Its axis $B_{${J}}$ rode along with {b} during the earlier factors and still passes through joint ${J}: joint${J < n ? `s ${J}–${n} have` : ` ${J} has`} not moved yet, so joint ${J} and {b} moved as one rigid piece.`
      } The purple part is what it will move. Press ▶| to apply it.`;
    }
    if (shown === 0) return `**Start at $M$:** every joint at zero and {b} where the figure draws it (the faint robot). The first factor is $${factorTeX(form, poeJointAt(n, 1, form))}$, next to $M$. Press ▶| to apply it.`;
    const j = poeJointAt(n, shown, form);
    const J = j + 1;
    const jt = arm.joints[j];
    const isR = jt.type === 'R';
    const amount = isR ? `turns by $\\theta_{${J}} = ${numTeX(theta[j] / DEG, 3)}^\\circ$` : `slides by $\\theta_{${J}} = ${numTeX(theta[j], 3)}$ m`;
    const later = J + 1 === n ? `joint ${n}` : `joints ${J + 1}–${n}`;
    const what = J === 1 ? 'the whole arm' : J === n ? 'the last link and {b}' : `everything after joint ${J} (purple: its link, ${later} and {b})`;
    if (form === 's')
      return `**Factor ${shown} of ${n}: $${factorTeX('s', j)}$** ${amount}: it moves ${what} ${isR ? `about the axis $S_{${J}}$, fixed in {s}` : `along the direction $v_{${J}}$ of $S_{${J}}$, fixed in {s}`}. ${
        J > 1 ? `Joint${J > 2 ? `s 1–${J - 1} are` : ' 1 is'} still at zero, so $S_{${J}}$ is still exactly ${isR ? `where joint ${J} is` : `the way joint ${J} slides`}.` : 'This is the last factor: joint 1 swings everything into place.'
      }`;
    return `**Factor ${shown} of ${n}: $${factorTeX('b', j)}$** ${amount}: it moves ${what} ${isR ? `about $B_{${J}}$, which rides with {b}` : `along $B_{${J}}$'s direction, which rides with {b}`}. ${
      J < n ? `${J + 1 === n ? `Joint ${n} is` : `Joints ${J + 1}–${n} are`} still at zero, so the chain from joint ${J} to {b} is rigid and $B_{${J}}$ still ${isR ? `passes through joint ${J}` : `points the way joint ${J} slides`}, wherever the earlier joints have put it.` : 'This is the last factor: only the end link moves.'
    }`;
  };

  // --- matrices for the current whole step
  const run = wrong ? wrongRun : steps.running;
  const factorAt = (step: number): Mat4 => (wrong ? expScrew(S[step - 1], theta[step - 1]) : steps.factor[step - 1]);
  const leftMul = form === 's' || wrong;
  const kj = k > 0 ? jointOfStep(k) : -1;
  const factorCap = k > 0 ? `${wrong ? factorTeX('s', kj) : factorTeX(form, kj)}` : '';
  const next = k < n ? jointOfStep(k + 1) : -1;
  const dSame = maxDiff(Tspace, Tbody);
  const dWrong = maxDiff(wrongRun[n], Tspace);
  const screwCap = (j: number) => {
    const sc = leftMul ? S[j] : steps.B[j];
    return `${leftMul ? 'S' : 'B'}_{${j + 1}} = ${vecNumTeX([...sc.w, ...sc.v])},\\ \\theta_{${j + 1}} = ${arm.joints[j].type === 'R' ? `${numTeX(theta[j] / DEG, 3)}^\\circ` : `${numTeX(theta[j], 3)}\\ \\text{m}`}`;
  };

  const hint = mode === 'exam' ? 'Faint robot: M (θ = 0) · faint frame: T(θ), where {b} must land · Orbit to rotate' : 'Drag to rotate · wheel to zoom';

  return (
    <>
      <div className="kin3d-main">
        <div>
          <Kin3DView onReady={setR} height={500} label={`The ${arm.name} being moved into place one product-of-exponentials factor at a time`} hint={hint}>
            <ViewBar r={r} mode={mode} setMode={setMode} />
            <div className="kin3d-corner">{wrong ? 'wrong order (fixed axes, joint 1 first)' : form === 's' ? 'space form: axes fixed in {s}' : 'body form: axes ride with {b}'}</div>
          </Kin3DView>
          <AxisLegend
            extra={
              <>
                <span>
                  <i style={{ background: 'var(--accent)' }} /> screw axis (bright: this factor)
                </span>
                <span>
                  <i style={{ background: 'var(--m4)' }} /> moved by this factor
                </span>
                {wrong && (
                  <span>
                    <i className="is-dash" style={{ background: 'var(--bad)' }} /> torn joint
                  </span>
                )}
                <span className="kin3d-sub">Drawn with {valuesText(arm, vals)}.</span>
              </>
            }
          />
        </div>

        <div className="kin3d-col">
          <section className="kin3d-panel" aria-label="Build T(θ) one factor at a time">
            <h4>Build T(θ) one factor at a time</h4>
            <Formula n={n} form={form} k={k} active={active} wrong={wrong} onPick={(st) => !wrong && goTo(st)} />
            <p className="kin3d-sub" style={{ margin: '0 0 6px' }}>
              {wrong ? 'Applied 1, 2, …, n (wrong): every factor about its fixed axis.' : form === 's' ? '← built from M leftwards: factor #1 is the one next to M.' : 'Built from M rightwards →: factor #1 is the one next to M.'}
            </p>
            {!wrong ? (
              <div className="stepper" role="group" aria-label="Step through the factors">
                <Button size="sm" onClick={() => goTo(0, { ms: 280 })} disabled={k === 0 && !tween.active} title="Back to M (all joints at zero)" aria-label="Back to M">
                  ⏮
                </Button>
                <Button size="sm" onClick={back} disabled={k === 0 && Math.abs(sRef.current) < 1e-6} title="Undo the last factor" aria-label="Undo the last factor">
                  ◀
                </Button>
                <Button size="sm" variant="primary" onClick={playPause} aria-label={tween.active ? 'Pause' : 'Play every factor'}>
                  {tween.active ? '⏸ Pause' : k >= n ? '↻ Replay' : '▶ Play'}
                </Button>
                <Button size="sm" onClick={forward} disabled={k >= n} title="Apply the next factor" aria-label="Apply the next factor">
                  ▶|
                </Button>
                <span className="mono small muted stepper-pos" aria-live="polite">
                  factor {k} / {n}
                </span>
              </div>
            ) : (
              <div className="kin3d-row">
                <Button size="sm" onClick={() => api.current.wrong?.()}>
                  ↻ Replay the wrong order
                </Button>
                <Button size="sm" variant="primary" onClick={() => resetTo(false)}>
                  Back to the right order
                </Button>
              </div>
            )}
            <Rich className="kin3d-explain" text={stepWords()} />
            {form === 's' && !wrong && (
              <div className="kin3d-row" style={{ marginTop: 8 }}>
                <Button size="sm" variant="ghost" onClick={() => api.current.wrong?.()} title="Apply e^[S1]θ1 first, then the others, each about its fixed axis">
                  Try the wrong order (joint 1 first, axes fixed)
                </Button>
              </div>
            )}
          </section>

          <section className="kin3d-panel" aria-label="Target joint values">
            <h4>Target joint values θ</h4>
            {arm.joints.map((j, i) => (
              <div key={i} className={`kin3d-joint ${activeJoint === i ? 'is-on' : ''}`}>
                {j.type === 'R' ? (
                  <Slider
                    label={`joint ${i + 1} (revolute)`}
                    tex={`\\theta_{${i + 1}}`}
                    tip={`joint ${i + 1} angle: positive turns anticlockwise about ω${i + 1} (right-hand rule)`}
                    value={theta[i] / DEG}
                    min={-180}
                    max={180}
                    step={1}
                    format={(v) => `${Math.round(v)}°`}
                    onChange={(v) => setOne(i, v * DEG)}
                  />
                ) : (
                  <Slider
                    label={`joint ${i + 1} (prismatic)`}
                    tex={`\\theta_{${i + 1}}`}
                    tip={`joint ${i + 1} extension along v${i + 1} (m)`}
                    value={theta[i]}
                    min={-0.5}
                    max={0.5}
                    step={0.01}
                    unit="m"
                    format={(v) => `${v.toFixed(2)} m`}
                    onChange={(v) => setOne(i, v)}
                  />
                )}
              </div>
            ))}
            <div className="kin3d-row" style={{ marginTop: 6 }}>
              <Button size="sm" onClick={() => setAll(defaultPoeTheta(arm))}>
                Default pose
              </Button>
              {arm.id === 'rrrp-2022' && (
                <Button size="sm" onClick={() => setAll(Q34)} title="θ = (−π/2, π, π/2, −h) with h = 0.3 m">
                  2022 Q34 pose
                </Button>
              )}
            </div>
          </section>
        </div>
      </div>

      <section className="kin3d-panel" style={{ marginTop: 14 }} aria-label="The matrices at this step">
        <h4>{k === 0 ? 'The 4 × 4 matrices: the start' : `The 4 × 4 matrices after factor ${k} of ${n}`}</h4>
        <div className="kin3d-mats">
          {k === 0 ? (
            <>
              <MatBlock cap="M\ (\theta = 0)" tex={matTeX(M)} />
              {next >= 0 && (
                <>
                  <span className="kin3d-op kin3d-sub">next factor:</span>
                  <MatBlock cap={`${factorTeX(leftMul ? 's' : 'b', next)}`} tex={matTeX(factorAt(1))} sub={screwCap(next)} />
                </>
              )}
            </>
          ) : leftMul ? (
            <>
              <MatBlock cap={factorCap} tex={matTeX(factorAt(k))} sub={screwCap(kj)} hot />
              <span className="kin3d-op">·</span>
              <MatBlock cap={productTeX(n, k - 1, form, wrong)} tex={matTeX(run[k - 1])} />
              <span className="kin3d-op">=</span>
              <MatBlock cap={productTeX(n, k, form, wrong)} tex={matTeX(run[k])} />
            </>
          ) : (
            <>
              <MatBlock cap={productTeX(n, k - 1, form)} tex={matTeX(run[k - 1])} />
              <span className="kin3d-op">·</span>
              <MatBlock cap={factorCap} tex={matTeX(factorAt(k))} sub={screwCap(kj)} hot />
              <span className="kin3d-op">=</span>
              <MatBlock cap={productTeX(n, k, form)} tex={matTeX(run[k])} />
            </>
          )}
        </div>
        <Rich
          className="kin3d-explain"
          text={
            leftMul
              ? 'Space form: each new factor multiplies from the **left** (a motion about an axis fixed in {s}). The last column of the product is where the {b} origin is, in metres; the first three columns are $\\hat x_b, \\hat y_b, \\hat z_b$ in {s}.'
              : 'Body form: each new factor multiplies from the **right** (a motion about an axis fixed in {b}, which itself moves). The last column is the {b} origin in {s}, in metres; the first three columns are $\\hat x_b, \\hat y_b, \\hat z_b$ in {s}.'
          }
        />
        {wrong ? (
          k >= n && (
            <div className="kin3d-mats" style={{ marginTop: 10 }}>
              <MatBlock cap={productTeX(n, n, 's', true)} tex={matTeX(wrongRun[n])} />
              <span className="kin3d-op">≠</span>
              <MatBlock cap="T(\theta)" tex={matTeX(Tspace)} />
              <span className="kin3d-status is-bad">✗ a different pose: entries differ by up to {numTeX(dWrong, 3)}</span>
            </div>
          )
        ) : k >= n ? (
          <div className="kin3d-mats" style={{ marginTop: 10 }}>
            <MatBlock cap="e^{[S_1]\theta_1}\cdots e^{[S_n]\theta_n}M" tex={matTeX(Tspace)} />
            <span className="kin3d-op">=</span>
            <MatBlock cap="Me^{[B_1]\theta_1}\cdots e^{[B_n]\theta_n}" tex={matTeX(Tbody)} />
            <span className="kin3d-status is-ok">✓ same T(θ) (largest difference {dSame < 1e-12 ? 'below 10⁻¹²' : dSame.toExponential(1)})</span>
          </div>
        ) : (
          <p className="kin3d-sub" style={{ margin: '8px 0 0' }}>
            Apply every factor to compare the result with the {form === 's' ? 'body' : 'space'} form.
          </p>
        )}
        {isQ34 && k >= n && (
          <Callout kind="info" title="2022 Q34">
            <Rich
              text={`At $\\theta = (-\\tfrac{\\pi}{2},\\ \\pi,\\ \\tfrac{\\pi}{2},\\ -h)$ the three revolutes add to $\\pi$ about $\\hat z$ and the slider drops by $h$: $T = \\begin{bmatrix} -1 & 0 & 0 & L_1 - L_2 \\\\ 0 & -1 & 0 & 0 \\\\ 0 & 0 & 1 & L_0 - h \\\\ 0 & 0 & 0 & 1 \\end{bmatrix}$, here with $L_0 = ${vals.L0}$, $L_1 = ${vals.L1}$, $L_2 = ${vals.L2}$ and $h = 0.3$ m (the worked solution's first option).`}
            />
          </Callout>
        )}
      </section>
    </>
  );
}

function MatBlock({ cap, tex, sub, hot }: { cap: string; tex: string; sub?: string; hot?: boolean }) {
  return (
    <div className={`kin3d-mat ${hot ? 'is-hot' : ''}`}>
      <div className="kin3d-mat-cap">
        <TeX>{cap}</TeX>
      </div>
      <TeX display>{tex}</TeX>
      {sub && (
        <div className="kin3d-mat-cap is-sub">
          <TeX>{sub}</TeX>
        </div>
      )}
    </div>
  );
}

/** T(θ) = … with one chip per factor, coloured by whether it has been applied; click a chip to go to it. */
function Formula({ n, form, k, active, wrong, onPick }: { n: number; form: PoeForm; k: number; active: number | null; wrong: boolean; onPick: (step: number) => void }) {
  const items: { tex: string; step: number }[] = [];
  if (form === 's' || wrong) {
    for (let j = 0; j < n; j++) items.push({ tex: factorTeX('s', j), step: wrong ? j + 1 : n - j });
    items.push({ tex: 'M', step: 0 });
  } else {
    items.push({ tex: 'M', step: 0 });
    for (let j = 0; j < n; j++) items.push({ tex: factorTeX('b', j), step: j + 1 });
  }
  return (
    <div className={`kin3d-formula ${n >= 6 ? 'is-tight' : ''}`} role="group" aria-label="The factors of the product">
      <TeX>{'T(\\theta) ='}</TeX>
      {items.map((it) => {
        const cls = it.step === 0 ? 'is-m' : it.step === active ? 'is-now' : it.step <= k ? 'is-done' : '';
        return (
          <button
            key={it.tex}
            type="button"
            className={`kin3d-factor ${cls}`}
            onClick={() => onPick(it.step)}
            disabled={wrong}
            title={it.step === 0 ? 'Back to M' : `Apply every factor up to #${it.step}`}
            aria-label={it.step === 0 ? 'M, the start' : `factor number ${it.step}${it.step <= k ? ', applied' : ''}`}
          >
            <TeX>{it.tex}</TeX>
            <span className="kin3d-factor-step">{it.step === 0 ? 'start' : `#${it.step}`}</span>
          </button>
        );
      })}
    </div>
  );
}

const PredictBlock = memo(function PredictBlock({ api, reveal }: { api: MutableRefObject<PoeApi>; reveal: () => void }) {
  return (
    <div className="kin3d-predicts">
      <PredictReveal
        id="kin-poe-first"
        question={'Space form, built from $M$: every factor is a motion about an axis **fixed** in {s}. Which factor has to be applied first so that its axis still passes through its joint?'}
        options={['$e^{[S_1]\\theta_1}$, the leftmost (base joint first)', '$e^{[S_n]\\theta_n}$, the one next to $M$ (last joint first)', 'Any of them: the order does not matter', 'They must all be applied at once']}
        answer={1}
        explain={
          '$S_i$ describes joint $i$ at the zero configuration, so turning about the fixed line $S_i$ is joint $i$\'s real motion only while joints $1, \\dots, i-1$ are still at zero. Applying $e^{[S_n]\\theta_n}$ first (only the last link moves), then $e^{[S_{n-1}]\\theta_{n-1}}$ (it swings the last two links, joint $n$ included, about a joint that has not moved), and so on, keeps that true at every step; $e^{[S_1]\\theta_1}$ finally swings the whole arm. That is the product read from $M$ outwards: right to left.'
        }
        tryIt="press Show me: the space form is built from M, last joint first; each purple part swings about a fixed axis."
        onApply={() => (reveal(), api.current.firstStep?.())}
      />
      <PredictReveal
        id="kin-poe-wrong"
        question={'Now apply the same fixed-axis factors the other way round: $e^{[S_1]\\theta_1}$ first, then $e^{[S_2]\\theta_2}$ about the fixed $S_2$, and so on. Where does {b} end up?'}
        options={['At $T(\\theta)$: the order of the factors does not matter', 'At $T(\\theta)$, the links just get there in a different order', 'Back at $M$: the factors cancel each other out', 'Somewhere else: the arm comes apart at its joints']}
        answer={3}
        explain={
          'Matrix products do not commute. Once $e^{[S_1]\\theta_1}$ has swung the arm, joint 2 is no longer on the fixed line $S_2$, so turning the links after it about $S_2$ drags them off the joint (the red gaps), and so on down the arm: {b} lands at $e^{[S_n]\\theta_n}\\cdots e^{[S_1]\\theta_1}M \\neq T(\\theta)$. To move the base joint first, every later axis has to move with the arm: that is exactly the body form.'
        }
        tryIt="press Show me: the factors are applied base joint first about fixed axes; watch for red gaps and compare the final matrices."
        onApply={() => (reveal(), api.current.wrong?.())}
      />
      <PredictReveal
        id="kin-poe-body"
        question={'Body form, $T = Me^{[B_1]\\theta_1}\\cdots e^{[B_n]\\theta_n}$, is built from $M$ rightwards, so joint 1 moves first. $B_2$ is fixed in {b}. After $e^{[B_1]\\theta_1}$ has been applied, where is the axis $B_2$?'}
        options={['Still through joint 2: it moved with {b}', 'Where joint 2 was at $\\theta = 0$, since $B_2$ is a fixed table entry', 'Through the origin of {b}, wherever {b} has gone', 'Through the origin of {s}']}
        answer={0}
        explain={
          'Multiplying from the right is a motion about an axis written in the moving frame {b}, so every $B_i$ rides with the end-effector. While joints $2, \\dots, n$ are still at zero the chain from joint 2 to {b} is rigid, so joint 2 and {b} moved together and $B_2$ still passes through joint 2. The body form is the mirror image of the space form: moving axes, base joint first.'
        }
        tryIt="press Show me: the body form applies the first factor and stops; the bright axis is the next one, still through its joint."
        onApply={() => (reveal(), api.current.bodyRide?.())}
      />
    </div>
  );
});
