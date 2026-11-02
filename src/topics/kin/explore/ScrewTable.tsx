// Fill the screw-axis table, in {s} or {b} (summary notes §6 steps 3–5; 2023 Q33b, 2024 Q30b, 2025 Q30b;
// review deck slide 20 for {b}). Joint by joint: the joint is highlighted with its drawn rotation arrow, the
// student picks ω (right-hand rule), drags a point q along the axis, and sees v = −ω × q come out of the notes'
// shortcut table. Below, the exam table: typed ω and v cells checked symbolically (L1, L2 …), with consistent
// sign flips and the classic ω × q slip recognised.
import { memo, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type MutableRefObject } from 'react';
import type { ExploreItem } from '../../../engine/types';
import { C, linStr, linVecEval, type ArmSpec, type Lin, type LinVec, type Vec3 } from '../../../core/kin';
import { Button, Callout, LinkButton, More, Segmented, Slider } from '../../../ui/kit';
import { PredictReveal } from '../../../ui/PredictReveal';
import { Rich, TeX } from '../../../ui/Rich';
import { href } from '../../../app/router';
import { AxisLegend, ArmPicker, Kin3DView, ViewBar, revealView, ease, triad, triadLabels, useArmChoice, useTween, type ArmRenderer, type Extra, type Label, type ViewMode } from './kin3dScene';
import {
  AXIS_VARS,
  SHORTCUT_TEX,
  SIGNED_AXES,
  armBounds,
  axisById,
  axisSpan,
  checkLinCell,
  linVecTeXs,
  qShift,
  readJoint,
  shortcutV,
  shortcutWorkTeX,
  signedAxisOf,
  signedAxisTeX,
  tToFoot,
  tidyT,
  valuesText,
  type CellState,
  type Frame,
} from './kin3dMath';

export const meta: Omit<ExploreItem, 'component'> = {
  id: 'screws',
  title: 'Fill the screw-axis table, in {s} and in {b}',
  summary:
    'Joint by joint: pick ω from the drawn rotation arrow, drag a point q along the axis, and watch $v = -\\omega \\times q$ come out of the cross-product shortcuts. Then fill the exam table yourself and check it. Switch to {b} to measure every q from the end-effector.',
  notice:
    'Flipping $\\omega$ flips $v$; any $q$ on the axis gives the same $v$; in {b}, $\\omega$ is written in {b} axes and $q$ is measured from the {b} origin.',
  minutes: 10,
};

type Pick = 'none' | '0' | (typeof SIGNED_AXES)[number]['id'];
interface ScrewApi {
  simplest?: () => void;
  flip?: () => void;
  body?: () => void;
  prismatic?: () => void;
}
type Apply = (armId: string, frame: Frame, fn: (a: ScrewApi) => void) => void;

const I3 = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];
const rv = (R: readonly (readonly number[])[], v: Vec3): Vec3 => [R[0][0] * v[0] + R[0][1] * v[1] + R[0][2] * v[2], R[1][0] * v[0] + R[1][1] * v[1] + R[1][2] * v[2], R[2][0] * v[0] + R[2][1] * v[1] + R[2][2] * v[2]];

export default function ScrewTable() {
  const choice = useArmChoice('rprr-2023');
  const [frame, setFrame] = useState<Frame>('s');
  const [mode, setMode] = useState<ViewMode>('exam');
  const api = useRef<ScrewApi>({});
  const pending = useRef<((a: ScrewApi) => void) | null>(null);
  const state = useRef({ choice, frame });
  state.current = { choice, frame };
  // the paper's frame for each robot (the review deck asks in {b})
  const lastArm = useRef(choice.arm.id);
  useEffect(() => {
    if (lastArm.current === choice.arm.id) return;
    lastArm.current = choice.arm.id;
    if (!pending.current) setFrame(choice.arm.askedIn);
  }, [choice.arm]);
  const root = useRef<HTMLDivElement>(null);
  const apply: Apply = useCallback((armId, fr, fn) => {
    revealView(root.current);
    const { choice: c, frame: f } = state.current;
    if (c.id === armId && f === fr) fn(api.current);
    else {
      pending.current = fn;
      lastArm.current = armId;
      c.setId(armId);
      setFrame(fr);
    }
  }, []);
  return (
    <div className="kin3d" ref={root}>
      <div className="kin3d-toolbar">
        <ArmPicker choice={choice} />
        <Segmented
          label="Frame of the table"
          value={frame}
          onChange={setFrame}
          options={[
            { value: 's', label: 'Space frame {s}', title: 'ω in {s} axes, q measured from the {s} origin' },
            { value: 'b', label: 'Body frame {b}', title: 'ω in {b} axes, q measured from the {b} origin' },
          ]}
        />
        <span className="kin3d-sub">
          {choice.arm.source}; the paper asks in {choice.arm.askedIn === 's' ? '{s}' : '{b}'}
        </span>
      </div>
      <ScrewInner key={`${choice.arm.id}|${frame}`} arm={choice.arm} vals={choice.vals} frame={frame} mode={mode} setMode={setMode} api={api} pending={pending} />
      <PredictBlock apply={apply} />
      <More label="The screw-axis method in the exam (summary notes §6, steps 3–5)">
        <Rich
          text={`1. **Revolute joint:** $\\omega_i$ is the unit vector along the axis, its sign from the drawn rotation arrow and the right-hand rule (curl your fingers with the arrow; your thumb is $\\omega_i$).
2. Pick **any** point $q_i$ on the axis. The easiest has a zero in the coordinate along the axis.
3. $v_i = -\\omega_i \\times q_i$, with the shortcuts
$$\\begin{array}{c|c} \\omega & v = -\\omega \\times q \\\\ \\hline (1,0,0) & (0,\\ q_z,\\ -q_y) \\\\ (0,1,0) & (-q_z,\\ 0,\\ q_x) \\\\ (0,0,1) & (q_y,\\ -q_x,\\ 0) \\end{array}$$
and $v$ negated when $\\omega$ is negated. Check: 2023 Q33 joint 3 has $\\omega = (1, 0, 0)$, $q = (0, 0, L_1)$, so $v = (0, L_1, 0)$.
4. **Prismatic joint:** $\\omega_i = 0$ and $v_i$ is the unit direction of travel.
5. **In {b}** (review deck): write $\\omega_i$ in {b}'s axes and measure $q_i$ from the {b} origin along {b}'s axes, then use the same formula. Equivalently $\\omega_b = R^T\\omega_s$, $q_b = R^T(q_s - p)$.
6. Present a table $i,\\ \\omega_i,\\ q_i,\\ v_i$. A misread arrow flips both $\\omega_i$ and $v_i$, so consistent working still earns most of the marks.`}
        />
        <div className="kin3d-row" style={{ marginTop: 8 }}>
          <LinkButton href={href(['kin', 'solve', 'kin-screws'], { t: 2 })} variant="primary">
            Practise: screw axes for a new robot (exam style)
          </LinkButton>
        </div>
      </More>
    </div>
  );
}

function ScrewInner({
  arm,
  vals,
  frame,
  mode,
  setMode,
  api,
  pending,
}: {
  arm: ArmSpec;
  vals: Record<string, number>;
  frame: Frame;
  mode: ViewMode;
  setMode: (m: ViewMode) => void;
  api: MutableRefObject<ScrewApi>;
  pending: MutableRefObject<((a: ScrewApi) => void) | null>;
}) {
  const n = arm.joints.length;
  const [r, setR] = useState<ArmRenderer | null>(null);
  const [sel, setSel] = useState(0);
  const [picks, setPicks] = useState<Pick[]>(() => arm.joints.map(() => 'none'));
  // q starts at the joint, less any plain-number drawing offset along its own axis (the review deck's joint 3)
  const [ts, setTs] = useState<number[]>(() =>
    arm.joints.map((j, i) => {
      if (j.type !== 'R') return 0;
      const rd = readJoint(arm, i, frame);
      return tidyT(rd.q, rd.dir);
    })
  );
  const [typed, setTyped] = useState<string[][]>(() => arm.joints.map(() => ['', '', '', '', '', '']));
  const [checked, setChecked] = useState(false);
  const [hover, setHover] = useState(false);
  const tween = useTween();
  const bounds = useMemo(() => armBounds(arm, vals), [arm, vals]);
  const u = bounds.size;
  const reads = useMemo(() => arm.joints.map((_, i) => readJoint(arm, i, frame)), [arm, frame]);
  const p = useMemo(() => linVecEval(arm.p, vals), [arm, vals]);
  const sub = frame;
  const jd = reads[sel];
  const t = ts[sel];
  const qS0 = linVecEval(jd.qS, vals);
  const qS: Vec3 = [qS0[0] + t * jd.dirS[0], qS0[1] + t * jd.dirS[1], qS0[2] + t * jd.dirS[2]];
  const qF: LinVec = qShift(jd.q, jd.dir, t);
  const pick = picks[sel];
  const pickedW: Vec3 | null = pick === 'none' ? null : pick === '0' ? [0, 0, 0] : axisById(pick)!.v;
  const tFoot = jd.type === 'R' ? tToFoot(jd.q, jd.dir, vals) : 0;

  // --- scene
  useEffect(() => {
    if (!r) return;
    r.setArm(arm, vals);
    r.setView(mode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r, arm, vals]);
  useEffect(() => {
    r?.setHighlight(sel);
  }, [r, sel]);
  useEffect(() => {
    if (!r) return;
    const ex: Extra[] = [];
    const lb: Label[] = [];
    const tl = 0.3 * u;
    const sOn = frame === 's';
    ex.push(...triad([0, 0, 0], I3, tl, 0, sOn ? 1 : 0.4), ...triad(p, arm.R, tl, 0, sOn ? 0.4 : 1, sOn ? undefined : 0.016 * u));
    lb.push(...triadLabels('s', [0, 0, 0], I3, tl, 's', 0, sOn ? '' : 'is-dim'), ...triadLabels('b', p, arm.R, tl, 'b', 0, sOn ? 'is-dim' : ''));
    const origin: Vec3 = sOn ? [0, 0, 0] : p;
    if (jd.type === 'R') {
      const span = axisSpan(bounds.pts, qS, jd.dirS, 0.22 * u);
      const wS = pickedW && (pickedW[0] || pickedW[1] || pickedW[2]) ? rv(sOn ? I3 : arm.R, pickedW) : null;
      const along = wS ? wS : jd.dirS;
      const sp = wS && wS[0] * jd.dirS[0] + wS[1] * jd.dirS[1] + wS[2] * jd.dirS[2] < 0 ? ([-span[1], -span[0]] as [number, number]) : span;
      ex.push({ kind: 'axis', q: qS, w: along, span: sp, color: wS ? '--accent' : '--text-3', head: !!wS, r: 0.007 * u });
      ex.push({ kind: 'arc', at: qS0, w: jd.dirS, r: r.jr * 2, color: '--text-2', tube: 0.011 * u });
      ex.push({ kind: 'point', at: qS, color: '--accent', r: (hover ? 0.036 : 0.03) * u });
      ex.push({ kind: 'dash', from: origin, to: qS, color: '--accent' });
      lb.push({ key: 'q', tex: `q_{${sel + 1}}`, at: [(origin[0] + qS[0]) / 2, (origin[1] + qS[1]) / 2, (origin[2] + qS[2]) / 2], color: 'var(--accent)', cls: 'is-tag' });
      if (wS) lb.push({ key: 'w', tex: `\\omega_{${sel + 1}}`, at: [qS[0] + along[0] * (sp[1] + 0.07 * u), qS[1] + along[1] * (sp[1] + 0.07 * u), qS[2] + along[2] * (sp[1] + 0.07 * u)], from: qS, color: 'var(--accent)', cls: 'is-tag' });
    } else {
      ex.push({ kind: 'arrow', from: qS0, dir: jd.dirS, len: 0.4 * u, color: '--accent', r: 0.009 * u });
      lb.push({ key: 'w', tex: `v_{${sel + 1}}`, at: [qS0[0] + jd.dirS[0] * 0.4 * u, qS0[1] + jd.dirS[1] * 0.4 * u, qS0[2] + jd.dirS[2] * 0.4 * u], from: qS0, color: 'var(--accent)', cls: 'is-tag' });
    }
    r.setExtras(ex);
    r.setLabels(lb);
  }, [r, arm, p, u, bounds, frame, sel, jd, qS0[0], qS0[1], qS0[2], t, pick, hover]);
  useEffect(() => {
    if (!r) return;
    r.setInteraction({
      hit: (x, y) => {
        if (jd.type !== 'R') return null;
        const s = r.project(qS);
        return s && Math.hypot(s.x - x, s.y - y) < 16 ? 'q' : null;
      },
      hover: (id) => setHover(id === 'q'),
      drag: (_id, x, y) => {
        const a = r.project(qS0);
        const b = r.project([qS0[0] + jd.dirS[0], qS0[1] + jd.dirS[1], qS0[2] + jd.dirS[2]]);
        if (!a || !b) return;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const L2 = dx * dx + dy * dy;
        if (L2 < 36) return; // the axis points at the camera: orbit first
        let nt = ((x - a.x) * dx + (y - a.y) * dy) / L2;
        nt = Math.max(-1.6 * u, Math.min(1.6 * u, nt));
        if (Math.abs(nt - tFoot) < 0.05 * u) nt = tFoot;
        else if (Math.abs(nt) < 0.05 * u) nt = 0;
        tween.stop();
        setTs((v) => v.map((x0, k) => (k === sel ? nt : x0)));
      },
    });
    return () => r.setInteraction(null);
  });

  // --- predictions
  const selectAnim = (i: number, pk: Pick, toT?: number) => {
    setSel(i);
    setPicks((ps) => ps.map((x, k) => (k === i ? pk : x)));
    if (toT !== undefined) {
      const from = ts[i];
      tween.run(1500, (e) => setTs((v) => v.map((x, k) => (k === i ? from + (toT - from) * ease(e) : x))));
    }
  };
  api.current.simplest = () => {
    const i = n - 1;
    const rd = reads[i];
    const a = signedAxisOf(rd.w);
    selectAnim(i, a ? a.id : 'none', tToFoot(rd.q, rd.dir, vals));
  };
  api.current.flip = () => {
    const i = 2;
    const a = signedAxisOf(reads[i].w);
    if (a) selectAnim(i, axisById(a.id.replace(/^[+-]/, (s) => (s === '+' ? '-' : '+')))!.id);
  };
  api.current.body = () => {
    const a = signedAxisOf(reads[0].w);
    selectAnim(0, a ? a.id : 'none', 0);
    setMode('orbit');
    r?.flyNamed('exam');
  };
  api.current.prismatic = () => {
    selectAnim(1, '0');
    // show the slide: animate the joint out and back
    const from = arm.joints.map(() => 0);
    tween.run(1600, (e) => r?.setPose(from.map((x, k) => (k === 1 ? 0.35 * u * Math.sin(Math.PI * e) : x))), () => r?.setPose(from));
  };
  useEffect(() => {
    if (r && pending.current) {
      const f = pending.current;
      pending.current = null;
      window.setTimeout(() => f(api.current), 60);
    }
  }, [r, api, pending]);

  // --- the explorer's maths
  const wTeX = pickedW ? `(${pickedW.map((x) => (x === 0 ? '0' : String(x))).join(',\\ ')})` : '';
  const vTry: LinVec | null = pickedW === null ? null : jd.type === 'R' ? (pick === '0' ? null : shortcutV(pickedW, qF)) : pick === '0' ? [C(jd.dir[0]), C(jd.dir[1]), C(jd.dir[2])] : null;
  const pickVerdict = (): { ok: boolean; text: string } | null => {
    if (pick === 'none') return null;
    if (jd.type === 'P') return pick === '0' ? { ok: true, text: 'Right: a prismatic joint does not rotate, so $\\omega = 0$.' } : { ok: false, text: 'A prismatic joint does not rotate: $\\omega = 0$. Its direction of travel goes in $v$.' };
    if (pick === '0') return { ok: false, text: 'This joint rotates, so $\\omega$ is a unit vector along its axis, not 0.' };
    const a = axisById(pick)!;
    const truthA = signedAxisOf(jd.w)!;
    if (a.id === truthA.id) return { ok: true, text: `Right: curl your right hand the way the drawn arrow turns and your thumb points along $${signedAxisTeX(jd.w, sub)}$.` };
    if (a.axis === truthA.axis) return { ok: false, text: 'Right axis, but the drawn arrow turns the other way: with your right thumb along this $\\omega$ your fingers curl against the arrow. (Keep going: $v$ simply flips too.)' };
    if (frame === 'b') {
      const sAxis = signedAxisOf(jd.dirS);
      if (sAxis && a.id === sAxis.id) return { ok: false, text: `That is the direction in {s} axes. In {b}, write it along {b}'s axes: $\\omega_b = R^T\\omega_s$.` };
    }
    return { ok: false, text: 'The joint turns about a different axis. Find the cylinder’s axis in the figure, then read its direction in the table’s frame.' };
  };
  const pv = pickVerdict();

  // --- the typed table
  const answers = useMemo(() => reads.map((rd) => [...rd.w.map((x) => C(x)), ...rd.v] as Lin[]), [reads]);
  const cells: CellState[][] = typed.map((row, i) => row.map((s, k) => checkLinCell(s, answers[i][k], arm.symbols)));
  const rowVerdict = (i: number): 'ok' | 'flip' | 'cross' | 'w' | 'v' | 'empty' => {
    const c = cells[i];
    if (c.every((s) => s === 'empty')) return 'empty';
    if (c.every((s) => s === 'ok')) return 'ok';
    const wOk = c.slice(0, 3).every((s) => s === 'ok');
    const allOkOrNeg = c.every((s) => s === 'ok' || s === 'neg');
    // every nonzero v entry negated (zero entries read as ok either way)
    const vNegOrZero = c.slice(3).every((s, k) => s === 'neg' || Object.keys(answers[i][3 + k]).length === 0);
    if (allOkOrNeg && c.slice(0, 3).some((s) => s === 'neg') && vNegOrZero) return 'flip';
    if (wOk && vNegOrZero && c.slice(3).some((s) => s === 'neg')) return 'cross';
    return wOk ? 'v' : 'w';
  };
  const setCell = (i: number, k: number, v: string) => setTyped((tt) => tt.map((row, a) => (a === i ? row.map((x, b) => (b === k ? v : x)) : row)));
  const revealRow = (i: number) => setTyped((tt) => tt.map((row, a) => (a === i ? answers[i].map((c) => linStr(c)) : row)));
  const nOk = cells.filter((_, i) => rowVerdict(i) === 'ok').length;
  const ROW_MSG: Record<string, string> = {
    flip: 'ω and v are both flipped: consistent, so most marks survive, but the drawn arrow turns the other way.',
    cross: 'ω is right but v has the wrong sign: that is $\\omega \\times q$; the screw axis needs $v = -\\omega \\times q$.',
    w: 'ω is off: re-read the joint axis and the arrow (right-hand rule).',
    v: 'v is off: compute $-\\omega \\times q$ with any point $q$ on this axis (use the explorer above).',
  };

  const hint = jd.type === 'R' ? (mode === 'exam' ? 'Drag the point q along the axis · Exam view: down-left = out of the page' : 'Drag q along the axis · drag elsewhere to rotate') : 'Prismatic joint: no axis line, just a direction of travel';

  return (
    <>
      <div className="kin3d-main">
        <div>
          <Kin3DView onReady={setR} height={500} label={`The ${arm.name} with joint ${sel + 1} highlighted, its rotation arrow, axis and the point q`} hint={hint}>
            <ViewBar r={r} mode={mode} setMode={setMode} />
            <div className="kin3d-corner">
              table in {frame === 's' ? '{s}' : '{b}'}
              {arm.frames ? ` · {s} = ${arm.frames.s}, {b} = ${arm.frames.b}` : ''}
            </div>
          </Kin3DView>
          <AxisLegend
            extra={
              <>
                <span>
                  <i style={{ background: 'var(--text-2)' }} /> drawn rotation arrow
                </span>
                <span>
                  <i style={{ background: 'var(--accent)' }} /> your ω and q
                </span>
                <span className="kin3d-sub">Drawn with {valuesText(arm, vals)}.</span>
              </>
            }
          />
        </div>

        <div className="kin3d-col">
          <section className="kin3d-panel" aria-label={`Joint ${sel + 1}`}>
            <div className="kin3d-row" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
              <h4 style={{ margin: 0 }}>
                Joint {sel + 1} of {n}: {jd.type === 'R' ? 'revolute' : 'prismatic'}
              </h4>
              <div className="kin3d-row">
                {arm.joints.map((j, i) => (
                  <button key={i} type="button" className={`kin3d-chip ${i === sel ? 'is-on' : ''}`} onClick={() => setSel(i)} aria-label={`Joint ${i + 1}`}>
                    {i + 1}
                    <span className="kin3d-sub">{j.type}</span>
                  </button>
                ))}
              </div>
            </div>
            <Rich className="kin3d-explain" text={jd.type === 'R' ? `**a.** Which way is $\\omega_{${sel + 1}}$, in ${frame === 's' ? '{s}' : '{b}'} axes? Read the grey rotation arrow with the right-hand rule.` : `**a.** What is $\\omega_{${sel + 1}}$ for this sliding joint?`} />
            <div className="kin3d-axbtns" style={{ gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', marginTop: 6 }}>
              {[...SIGNED_AXES, null].map((a) => {
                const id: Pick = a ? a.id : '0';
                const on = pick === id;
                return (
                  <button
                    key={id}
                    type="button"
                    className={`kin3d-axbtn ${on ? (pv?.ok ? 'is-right' : 'is-wrong') : ''}`}
                    style={{ '--ax': a ? `var(${AXIS_VARS[a.axis]})` : 'var(--text-3)' } as CSSProperties}
                    aria-pressed={on}
                    aria-label={a ? `omega = ${a.id} ${sub}` : 'omega = 0'}
                    onClick={() => setPicks((ps) => ps.map((x, k) => (k === sel ? id : x)))}
                  >
                    <TeX>{a ? signedAxisTeX(a.v, sub) : '\\mathbf{0}'}</TeX>
                  </button>
                );
              })}
            </div>
            {pv && <Rich className="kin3d-explain" text={`${pv.ok ? '✓' : '✗'} ${pv.text}`} />}

            {jd.type === 'R' && (
              <>
                <Rich className="kin3d-explain" text={`**b.** A point on the axis, ${frame === 's' ? 'measured from the {s} origin' : 'measured from the {b} origin along {b}’s axes'}: drag the dot or use the slider.`} />
                <TeX display>{`q_{${sel + 1}} = ${linVecTeXs(qF)}`}</TeX>
                <Slider label="slide q along the axis" tex="t" tip="q = (the joint) + t × (axis direction), in metres" value={t} min={-1.6 * u} max={1.6 * u} step={0.01} format={(v) => `${v.toFixed(2)} m`} onChange={(v) => (tween.stop(), setTs((x) => x.map((y, k) => (k === sel ? v : y))))} />
                <div className="kin3d-row">
                  <Button size="sm" onClick={() => (tween.stop(), setTs((x) => x.map((y, k) => (k === sel ? 0 : y))))} disabled={Math.abs(t) < 1e-9}>
                    q at the joint
                  </Button>
                  <Button size="sm" onClick={() => (tween.stop(), setTs((x) => x.map((y, k) => (k === sel ? tFoot : y))))} disabled={Math.abs(t - tFoot) < 1e-9} title="The point of the axis nearest the frame origin: its coordinate along the axis is 0">
                    Simplest q (0 along the axis)
                  </Button>
                </div>
              </>
            )}
            <Rich className="kin3d-explain" text={jd.type === 'R' ? `**c.** $v_{${sel + 1}} = -\\omega_{${sel + 1}} \\times q_{${sel + 1}}$:` : `**b.** $v_{${sel + 1}}$ is the unit direction of travel (the accent arrow), in ${frame === 's' ? '{s}' : '{b}'} axes:`} />
            {vTry ? (
              <>
                {jd.type === 'R' && pickedW && signedAxisOf(pickedW) && (
                  <ShortcutTable axis={signedAxisOf(pickedW)!.axis} neg={signedAxisOf(pickedW)!.sign < 0} />
                )}
                <TeX display>
                  {jd.type === 'R'
                    ? `\\begin{aligned} v_{${sel + 1}} &= -${wTeX} \\times ${linVecTeXs(qF)} \\\\ &= ${(() => {
                        const work = shortcutWorkTeX(pickedW!, qF);
                        const res = linVecTeXs(vTry);
                        return work && work !== res ? `${work} = ${res}` : res;
                      })()} \\end{aligned}`
                    : `v_{${sel + 1}} = ${linVecTeXs(vTry)}`}
                </TeX>
                {jd.type === 'R' && (
                  <div className="kin3d-row">
                    <Button size="sm" onClick={() => setPicks((ps) => ps.map((x, k) => (k === sel && x !== 'none' && x !== '0' ? (x.startsWith('+') ? '-' : '+') + x.slice(1) : x) as Pick))}>
                      Flip ω{sel + 1}
                    </Button>
                    <span className="kin3d-sub">
                      numerically <TeX>{`(${linVecEval(vTry, vals).map((x) => (Math.abs(x) < 5e-4 ? '0' : x.toFixed(2))).join(',\\ ')})\\ \\text{m}`}</TeX>
                    </span>
                  </div>
                )}
              </>
            ) : (
              <p className="kin3d-sub" style={{ margin: '4px 0 0' }}>
                Choose ω first.
              </p>
            )}
          </section>
        </div>
      </div>

      <section className="kin3d-panel" style={{ marginTop: 14 }} aria-label="Screw-axis table">
        <div className="kin3d-row" style={{ justifyContent: 'space-between' }}>
          <h4 style={{ margin: 0 }}>
            The exam table: screw axes in {frame === 's' ? '{s}' : '{b}'} (type each cell; symbols {arm.symbols.join(', ')})
          </h4>
          <div className="kin3d-row">
            <Button size="sm" variant="primary" onClick={() => setChecked(true)}>
              Check table
            </Button>
            <Button size="sm" onClick={() => setTyped(answers.map((row) => row.map((c) => linStr(c))))}>
              Reveal all
            </Button>
            <Button size="sm" variant="ghost" onClick={() => (setTyped(arm.joints.map(() => ['', '', '', '', '', ''])), setChecked(false))}>
              Clear
            </Button>
          </div>
        </div>
        <table className="kin3d-table" style={{ marginTop: 8 }}>
          <thead>
            <tr>
              <th>i</th>
              <th>
                <TeX>{'\\omega_i'}</TeX>
              </th>
              <th>
                <TeX>{'q_i'}</TeX> (your point, from the explorer)
              </th>
              <th>
                <TeX>{'v_i'}</TeX>
              </th>
              <th />
            </tr>
          </thead>
          <tbody>
            {arm.joints.map((j, i) => {
              const rd = reads[i];
              const vd = checked ? rowVerdict(i) : 'empty';
              return (
                <tr key={i} className={i === sel ? 'is-on' : ''} onFocus={() => setSel(i)} onClick={() => setSel(i)}>
                  <td>
                    {i + 1}
                    <span className="kin3d-sub"> {j.type}</span>
                  </td>
                  <td>
                    <Cells i={i} base={0} narrow typed={typed[i]} cells={cells[i]} checked={checked} setCell={setCell} sym="\omega" />
                  </td>
                  <td>
                    <TeX>{rd.type === 'R' ? linVecTeXs(qShift(rd.q, rd.dir, ts[i])) : '\\text{—}'}</TeX>
                  </td>
                  <td>
                    <Cells i={i} base={3} typed={typed[i]} cells={cells[i]} checked={checked} setCell={setCell} sym="v" />
                  </td>
                  <td className="is-left" style={{ minWidth: 150 }}>
                    {vd === 'ok' ? (
                      <span className="kin3d-status is-ok">✓</span>
                    ) : vd === 'empty' ? (
                      <Button size="sm" variant="ghost" onClick={(e) => (e.stopPropagation(), revealRow(i))}>
                        Reveal row
                      </Button>
                    ) : (
                      <span className="kin3d-sub">
                        <Rich text={`✗ ${ROW_MSG[vd]}`} inline />
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {checked && nOk === n && (
          <div style={{ marginTop: 8 }}>
            <Callout kind="ok" title={`All ${n} screw axes right`}>
              <Rich text={`That is part (b) of the arm question. ${frame === 's' ? 'Now try the same robot in {b}: the ω are rotated by $R^T$ and every q is measured from the end-effector.' : 'Compare with {s}: $B_i = [\\mathrm{Ad}_{M^{-1}}]S_i$, the same axes seen from the end-effector.'}`} />
            </Callout>
          </div>
        )}
        <p className="kin3d-sub" style={{ margin: '8px 0 0' }}>
          Cells take numbers or expressions such as <code>-{arm.symbols[0]}</code> or <code>{arm.symbols.slice(0, 2).join('+')}</code>; they are checked by evaluating at hidden values of the lengths, so any equivalent form counts.
        </p>
      </section>
    </>
  );
}

function Cells({ i, base, typed, cells, checked, setCell, sym, narrow }: { i: number; base: number; typed: string[]; cells: CellState[]; checked: boolean; setCell: (i: number, k: number, v: string) => void; sym: string; narrow?: boolean }) {
  return (
    <span className="kin3d-cells">
      <span className="kin3d-paren">(</span>
      {[0, 1, 2].map((k) => {
        const s = cells[base + k];
        return (
          <span key={k} className="kin3d-cells">
            <input
              className={`kin3d-cell ${narrow ? 'is-narrow' : 'is-wide'} ${checked && s !== 'empty' ? `is-${s}` : ''}`}
              value={typed[base + k]}
              aria-label={`${sym === 'v' ? 'v' : 'omega'} ${i + 1}, ${'xyz'[k]} component`}
              spellCheck={false}
              onChange={(e) => setCell(i, base + k, e.target.value)}
            />
            {k < 2 && <span className="kin3d-paren">,</span>}
          </span>
        );
      })}
      <span className="kin3d-paren">)</span>
    </span>
  );
}

function ShortcutTable({ axis, neg }: { axis: 0 | 1 | 2; neg: boolean }) {
  return (
    <table className="kin3d-table kin3d-shortcut" style={{ margin: '4px 0' }} aria-label="Cross-product shortcuts from the notes">
      <tbody>
        {[0, 1, 2].map((k) => (
          <tr key={k}>
            <td className={k === axis ? 'is-on' : ''}>
              <TeX>{`\\omega = ${['(1, 0, 0)', '(0, 1, 0)', '(0, 0, 1)'][k]}`}</TeX>
            </td>
            <td className={k === axis ? 'is-on' : ''}>
              <TeX>{`v = ${SHORTCUT_TEX[k]}`}</TeX>
            </td>
            {k === axis && neg ? (
              <td className="is-on kin3d-sub" rowSpan={1}>
                negate for −ω
              </td>
            ) : (
              <td />
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const PredictBlock = memo(function PredictBlock({ apply }: { apply: Apply }) {
  return (
    <div className="kin3d-predicts">
      <PredictReveal
        id="kin-screws-simplest"
        question="2025 arm, joint 5: $\omega_5 = (1, 0, 0)$ and the joint sits at the tip, $(L_2 + L_3 + L_4,\ 0,\ L_1)$. If you slide $q_5$ along the axis to $(0, 0, L_1)$, what is $v_5$?"
        options={['$(0,\\ L_1,\\ -(L_2+L_3+L_4))$', '$(0,\\ 0,\\ 0)$: the new $q$ makes $v$ vanish', '$(0,\\ L_1,\\ 0)$: unchanged', '$(L_2+L_3+L_4,\\ L_1,\\ 0)$']}
        answer={2}
        explain="With $\omega = \hat x$, the shortcut is $v = (0,\ q_z,\ -q_y)$: $q_x$ never appears, so moving $q$ along $\hat x$ cannot change $v$. Both points give $v_5 = (0, L_1, 0)$. Choosing the point with a zero along the axis just saves writing (the 2025 worked solution does exactly this)."
        tryIt="press Show me: q slides from the tip to the point nearest the origin while v stays (0, L₁, 0)."
        onApply={() => apply('rrrrr-2025', 's', (a) => a.simplest?.())}
      />
      <PredictReveal
        id="kin-screws-flip"
        question="2023 arm, joint 3: the answer is $\omega_3 = (1, 0, 0)$, $q_3 = (0, 0, L_1)$, $v_3 = (0, L_1, 0)$. You misread the arrow and write $\omega_3 = (-1, 0, 0)$. What $v_3$ do you get?"
        options={['$(0,\\ L_1,\\ 0)$', '$(0,\\ 0,\\ L_1)$', '$(-L_1,\\ 0,\\ 0)$', '$(0,\\ -L_1,\\ 0)$']}
        answer={3}
        explain="$v = -\omega \times q$ is linear in $\omega$, so negating $\omega$ negates $v$: $(0, -L_1, 0)$. The whole screw axis is reversed, which describes the same joint with $\theta_3$ counted the other way, so a consistent table loses little (2023 worked solution)."
        tryIt="press Show me: ω₃ is set to −x̂ₛ and the shortcut row is negated."
        onApply={() => apply('rprr-2023', 's', (a) => a.flip?.())}
      />
      <PredictReveal
        id="kin-screws-body"
        question="Review deck robot, screw axes **in {b}**. {b} has the same orientation as {0} and its origin is at $(L_1,\ L_3+L_4,\ -L_5-L_6)$. Joint 1 turns about $\hat x$ through the {0} origin. What is $v_1$ in {b}?"
        options={['$(0,\\ 0,\\ 0)$: the axis passes through the {0} origin', '$(0,\\ L_5+L_6,\\ L_3+L_4)$', '$(0,\\ -L_5-L_6,\\ -L_3-L_4)$', '$(L_1,\\ L_5+L_6,\\ L_3+L_4)$']}
        answer={1}
        explain="In {b}, $q$ is measured from the {b} origin: the {0} origin is at $q_1 = (-L_1,\ -L_3-L_4,\ L_5+L_6)$ from {b} (the deck writes $(0, -L_3-L_4, L_5+L_6)$, another point on the same axis). With $\omega_1 = \hat x$: $v_1 = (0,\ q_z,\ -q_y) = (0,\ L_5+L_6,\ L_3+L_4)$, as on slide 20. $v = 0$ is the {s} answer, where the axis does pass through the origin."
        tryIt="press Show me: the table switches to {b}; the dashed q now starts at the {b} origin."
        onApply={() => apply('review-6dof', 'b', (a) => a.body?.())}
      />
      <PredictReveal
        id="kin-screws-prismatic"
        question="2023 arm, joint 2 is prismatic and slides straight up. What is its screw axis $S_2 = (\omega_2, v_2)$?"
        options={['$\\omega_2 = (0, 0, 1)$, $v_2 = (0, 0, 0)$', '$\\omega_2 = (0, 0, 1)$, $v_2 = (0, 0, 1)$', '$\\omega_2 = (0, 0, 0)$, $v_2 = (0, 0, 1)$', '$\\omega_2 = (0, 0, 0)$, $v_2 = (0, 0, 0.5)$: where the joint is']}
        answer={2}
        explain="A sliding joint has no rotation, so $\omega_2 = 0$, and $v_2$ is the **unit** direction of travel, $+\hat z_s$. Its position does not matter: a translation has no axis line, so there is no $q$ (the table shows —)."
        tryIt="press Show me: joint 2 is selected and slides up and back along v₂."
        onApply={() => apply('rprr-2023', 's', (a) => a.prismatic?.())}
      />
    </div>
  );
});
