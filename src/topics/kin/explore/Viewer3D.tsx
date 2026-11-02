// 3-D arm viewer (summary notes §6; the arm long answer: 2023 Q33, 2024 Q30, 2025 Q30; review deck slide 20).
// The exam robots (or a random axis-aligned arm) in the paper's oblique view or a free orbit, joint sliders
// driving the space-form PoE, {s} and {b} triads, every screw axis drawn as a line through q along ω, and a
// panel with S_i = (ω_i, v_i) for the selected joint, symbolic and numeric. q can slide along its axis and ω can
// be flipped, so "any q on the axis gives the same v" and "flip ω, flip v" are seen, not just stated.
import { memo, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import type { ExploreItem } from '../../../engine/types';
import { armM, armScrewsS, fkSpace, linVecEval, linNeg, type ArmSpec, type LinVec, type Vec3 } from '../../../core/kin';
import { Button, Callout, LinkButton, More, Segmented, Slider, Toggle } from '../../../ui/kit';
import { PredictReveal } from '../../../ui/PredictReveal';
import { Rich, TeX } from '../../../ui/Rich';
import { href } from '../../../app/router';

import { AxisLegend, ArmPicker, Kin3DView, ViewBar, ease, triad, triadLabels, useArmChoice, useTween, type ArmRenderer, type Extra, type Label, type ViewMode } from './kin3dScene';
import { DEG, SHORTCUT_TEX, armBounds, axisSpan, linVecTeXs, matTeX, qShift, readJoint, shortcutV, signedAxisOf, signedAxisTeX, valuesText, vecNumTeX } from './kin3dMath';

export const meta: Omit<ExploreItem, 'component'> = {
  id: 'viewer',
  title: '3D arm viewer: joints, screw axes and frames',
  summary:
    'Pick an exam robot (2023 RPRR, 2024 PRR, 2025 RRRRR, the review deck’s 6-DOF arm, the 2022 arms) or a random one, move the joint sliders and orbit around it. Every screw axis is drawn as a line through its point q along ω; the panel gives $S_i = (\\omega_i, v_i)$ for the joint you pick.',
  notice:
    'A revolute screw axis is a line in space: $\\omega$ gives its direction and any point $q$ on it gives $v = -\\omega \\times q$. Sliding $q$ along the axis does not change $v$; flipping $\\omega$ flips $v$.',
  minutes: 8,
};

interface ViewerApi {
  slideQ?: () => void;
  flip?: () => void;
  turnFirst?: () => void;
}

const zeros = (n: number) => new Array<number>(n).fill(0);

export default function Viewer3D() {
  const choice = useArmChoice('rprr-2023');
  const [mode, setMode] = useState<ViewMode>('exam');
  const api = useRef<ViewerApi>({});
  return (
    <div className="kin3d">
      <div className="kin3d-toolbar">
        <ArmPicker choice={choice} />
        <span className="kin3d-sub">{choice.arm.source}</span>
      </div>
      <ViewerInner key={choice.arm.id} arm={choice.arm} vals={choice.vals} mode={mode} setMode={setMode} api={api} />
      <PredictBlock api={api} />
      <More label="How to read a screw axis off the exam figure (summary notes §6)">
        <Rich
          text={`1. **Fix {s}.** Note which arrow points out of the page: on these figures it is drawn diagonally (down-left), so a diagonal arrow means into or out of the page, not "sideways".
2. **Revolute joint:** $\\omega_i$ is the unit vector along the joint axis. Its sign comes from the drawn rotation arrow and the right-hand rule: curl your fingers the way the arrow turns; your thumb is $\\omega_i$.
3. Take **any** point $q_i$ on the axis (pick one with easy coordinates, e.g. a zero along the axis), then $v_i = -\\omega_i \\times q_i$. Use the shortcuts:
$$\\omega = \\hat x:\\ v = (0,\\ q_z,\\ -q_y) \\qquad \\omega = \\hat y:\\ v = (-q_z,\\ 0,\\ q_x) \\qquad \\omega = \\hat z:\\ v = (q_y,\\ -q_x,\\ 0)$$
and negate $v$ when $\\omega$ is negated.
4. **Prismatic joint:** $\\omega_i = 0$ and $v_i$ is the unit direction of travel (the straight arrow).
5. **Why it works.** A point at $r$ on a body turning at unit rate about the axis moves with $\\dot r = \\omega \\times (r - q)$. At the origin of {s} that is $-\\omega \\times q = v$: the velocity of whatever point of the body is passing through the origin. Moving $q$ along $\\omega$ adds $\\omega \\times \\omega = 0$, so $v$ cannot depend on which point you chose.
6. The screw axes are always read with the robot at its **zero configuration**: the table describes where each joint is at $\\theta = 0$.`}
        />
        <div className="kin3d-row" style={{ marginTop: 8 }}>
          <LinkButton href={href(['kin', 'explore', 'screws'])}>Fill the screw table yourself</LinkButton>
          <LinkButton href={href(['kin', 'solve', 'kin-screws'], { t: 2 })} variant="primary">
            Practise: screw axes (exam style)
          </LinkButton>
        </div>
      </More>
    </div>
  );
}

function ViewerInner({ arm, vals, mode, setMode, api }: { arm: ArmSpec; vals: Record<string, number>; mode: ViewMode; setMode: (m: ViewMode) => void; api: MutableRefObject<ViewerApi> }) {
  const n = arm.joints.length;
  const [r, setR] = useState<ArmRenderer | null>(null);
  const [theta, setTheta] = useState<number[]>(() => zeros(n));
  const [sel, setSel] = useState(0);
  const [unit, setUnit] = useState<'deg' | 'rad'>('deg');
  const [axes, setAxes] = useState<'home' | 'now' | 'off'>('home');
  const [showT, setShowT] = useState(false);
  const [flips, setFlips] = useState<boolean[]>(() => arm.joints.map(() => false));
  const [qt, setQt] = useState(0);
  const tween = useTween();
  const bounds = useMemo(() => armBounds(arm, vals), [arm, vals]);
  const u = bounds.size;
  const M = useMemo(() => armM(arm, vals), [arm, vals]);
  const S = useMemo(() => armScrewsS(arm, vals), [arm, vals]);
  const T = useMemo(() => fkSpace(M, S, theta), [M, S, theta]);
  const reads = useMemo(() => arm.joints.map((_, i) => readJoint(arm, i, 's')), [arm]);
  const sj = reads[sel];

  // --- scene
  useEffect(() => {
    if (!r) return;
    r.setArm(arm, vals);
    r.setView(mode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r, arm, vals]);
  useEffect(() => {
    r?.setPose(theta);
  }, [r, theta]);
  useEffect(() => {
    r?.setHighlight(sel);
  }, [r, sel]);
  useEffect(() => {
    if (!r) return;
    const ex: Extra[] = [];
    const lb: Label[] = [];
    const tl = 0.3 * u;
    const p = linVecEval(arm.p, vals);
    ex.push(...triad([0, 0, 0], [[1, 0, 0], [0, 1, 0], [0, 0, 1]], tl, 0), ...triad(p, arm.R, tl, n));
    lb.push(...triadLabels('s', [0, 0, 0], [[1, 0, 0], [0, 1, 0], [0, 0, 1]], tl, 's'), ...triadLabels('b', p, arm.R, tl, 'b', n));
    if (axes !== 'off') {
      arm.joints.forEach((j, i) => {
        const on = i === sel;
        const w: Vec3 = flips[i] ? [-j.axis[0], -j.axis[1], -j.axis[2]] : j.axis;
        const q0 = linVecEval(j.q, vals);
        const q: Vec3 = on ? [q0[0] + qt * j.axis[0], q0[1] + qt * j.axis[1], q0[2] + qt * j.axis[2]] : q0;
        const span = axisSpan(bounds.pts, q, w, 0.22 * u);
        const bodies = axes === 'now' ? [i, 0] : [0];
        bodies.forEach((body, k) => {
          const ghost = k === 1;
          if (ghost && i === 0) return; // joint 1's axis never moves
          const op = ghost ? 0.16 : on ? 1 : 0.4;
          if (j.type === 'R') {
            ex.push({ kind: 'axis', q, w, span, color: '--accent', opacity: op, body, r: on && !ghost ? 0.008 * u : undefined });
            if (!ghost) ex.push({ kind: 'point', at: q, color: '--accent', opacity: on ? 1 : 0.55, r: (on ? 0.026 : 0.018) * u, body });
          } else ex.push({ kind: 'arrow', from: q, dir: w, len: 0.42 * u, color: '--accent', opacity: op, body, r: 0.008 * u });
          if (!ghost) {
            const reach = j.type === 'R' ? span[1] + 0.075 * u : 0.42 * u;
            const tip: Vec3 = [q[0] + w[0] * reach, q[1] + w[1] * reach, q[2] + w[2] * reach];
            lb.push({ key: `S${i}`, tex: `S_{${i + 1}}`, at: tip, from: q, body, cls: on ? 'is-tag' : 'is-small is-dim', color: 'var(--accent)' });
          }
        });
        if (on && j.type === 'R') {
          ex.push({ kind: 'arc', at: q, w, r: r.jr * 1.9, color: '--accent', body: axes === 'now' ? i : 0 });
          lb.push({ key: 'q', tex: `q_{${i + 1}}`, at: [q[0] + 0.05 * u, q[1] + 0.05 * u, q[2] + 0.05 * u], body: axes === 'now' ? i : 0, color: 'var(--accent)' });
          if (axes !== 'now' || i === 0) ex.push({ kind: 'dash', from: [0, 0, 0], to: q, color: '--text-2' });
        }
      });
    }
    r.setExtras(ex);
    r.setLabels(lb);
  }, [r, arm, vals, n, u, bounds, sel, axes, flips, qt]);

  // --- interactions for the predictions
  const firstRevoluteWithV = () => {
    const k = reads.findIndex((rd) => rd.type === 'R' && rd.v.some((c) => Object.keys(c).length > 0));
    return k >= 0 ? k : Math.max(0, reads.findIndex((rd) => rd.type === 'R'));
  };
  api.current.slideQ = () => {
    const i = reads[sel]?.type === 'R' ? sel : firstRevoluteWithV();
    setSel(i);
    if (axes === 'off') setAxes('home');
    const A = 0.6 * u;
    tween.run(2600, (t) => setQt(Math.round((A * Math.sin(2 * Math.PI * t)) / (A / 14)) * (A / 14)), () => setQt(0));
  };
  api.current.flip = () => {
    const i = reads[sel]?.type === 'R' && reads[sel].v.some((c) => Object.keys(c).length > 0) ? sel : firstRevoluteWithV();
    setSel(i);
    if (axes === 'off') setAxes('home');
    setFlips((f) => f.map((x, k) => (k === i ? !x : x)));
  };
  api.current.turnFirst = () => {
    const i = Math.max(0, reads.findIndex((rd) => rd.type === 'R'));
    setAxes('now');
    setSel(Math.min(n - 1, i + 1));
    const from = theta.slice();
    const to = theta.slice();
    to[i] = Math.PI / 2;
    tween.run(1400, (t) => setTheta(from.map((x, k) => x + (to[k] - x) * ease(t))));
  };

  // --- panel maths for the selected joint
  const w = flips[sel] ? (sj.w.map((x) => -x) as Vec3) : sj.w;
  const qSel: LinVec = sj.type === 'R' ? qShift(sj.q, sj.dir, qt) : sj.q;
  const vSel: LinVec = sj.type === 'R' ? shortcutV(w, qSel) : (sj.v.map((c) => (flips[sel] ? linNeg(c) : c)) as LinVec);
  const ax = signedAxisOf(sj.dir);
  const sideNote = sj.type === 'R' && ax ? `\\omega = ${flips[sel] ? '-' : ''}\\hat{${'xyz'[ax.axis]}}:\\ v = ${flips[sel] !== ax.sign < 0 ? '-' : ''}${SHORTCUT_TEX[ax.axis]}` : '';

  const jointLabel = (i: number) => (arm.joints[i].type === 'R' ? `\\theta_{${i + 1}}` : `d_{${i + 1}}`);
  const hint = mode === 'exam' ? 'Exam view: out of the page is drawn down-left, like the paper. Switch to Orbit to rotate.' : 'Drag to rotate · wheel to zoom · right-drag to pan';

  return (
    <>
      <div className="kin3d-main">
        <div>
          <Kin3DView onReady={setR} height={500} label={`3-D view of the ${arm.name} with its screw axes and the {s} and {b} frames`} hint={hint}>
            <ViewBar r={r} mode={mode} setMode={setMode} />
            {arm.frames && (
              <div className="kin3d-corner">
                {'{s}'} = {arm.frames.s} · {'{b}'} = {arm.frames.b}
              </div>
            )}
          </Kin3DView>
          <AxisLegend
            extra={
              <>
                <span>
                  <i style={{ background: 'var(--accent)' }} /> screw axis (arrow = +ω)
                </span>
                <span>
                  <i className="is-dot" style={{ background: 'var(--accent)' }} /> point q on the axis
                </span>
                <span className="kin3d-sub">Drawn with {valuesText(arm, vals)}.</span>
              </>
            }
          />
        </div>

        <div className="kin3d-col">
          <section className="kin3d-panel" aria-label="Joint values">
            <h4>Joints (click one to inspect its screw axis)</h4>
            {arm.joints.map((j, i) => (
              <div key={i} className={`kin3d-joint ${i === sel ? 'is-on' : ''}`} onPointerDown={() => setSel(i)} onFocus={() => setSel(i)}>
                {j.type === 'R' ? (
                  <Slider
                    label={`joint ${i + 1} (revolute)`}
                    tex={jointLabel(i)}
                    tip={`joint ${i + 1} angle: positive turns anticlockwise about ω${i + 1} (right-hand rule)`}
                    value={unit === 'deg' ? theta[i] / DEG : theta[i]}
                    min={unit === 'deg' ? -180 : -Math.PI}
                    max={unit === 'deg' ? 180 : Math.PI}
                    step={unit === 'deg' ? 1 : 0.01}
                    format={(v) => (unit === 'deg' ? `${Math.round(v)}°` : `${v.toFixed(2)} rad`)}
                    onChange={(v) => {
                      tween.stop();
                      setTheta((t) => t.map((x, k) => (k === i ? (unit === 'deg' ? v * DEG : v) : x)));
                    }}
                  />
                ) : (
                  <Slider
                    label={`joint ${i + 1} (prismatic)`}
                    tex={jointLabel(i)}
                    tip={`joint ${i + 1} extension along its direction of travel (m)`}
                    value={theta[i]}
                    min={-0.4 * u}
                    max={0.4 * u}
                    step={0.01}
                    unit="m"
                    format={(v) => `${v.toFixed(2)} m`}
                    onChange={(v) => {
                      tween.stop();
                      setTheta((t) => t.map((x, k) => (k === i ? v : x)));
                    }}
                  />
                )}
              </div>
            ))}
            <div className="kin3d-row" style={{ marginTop: 8 }}>
              <Button size="sm" onClick={() => (tween.stop(), setTheta(zeros(n)))} title="All joints at zero: the pose the exam figure shows">
                Zero configuration
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  tween.stop();
                  setTheta(arm.joints.map((j) => (j.type === 'R' ? (Math.random() * 2 - 1) * 0.6 * Math.PI : (Math.random() * 2 - 1) * 0.25 * u)));
                }}
              >
                Random pose
              </Button>
              <Segmented
                size="sm"
                label="Angle unit"
                value={unit}
                onChange={setUnit}
                options={[
                  { value: 'deg', label: 'deg' },
                  { value: 'rad', label: 'rad' },
                ]}
              />
            </div>
          </section>

          <section className="kin3d-panel" aria-label="Display">
            <h4>Screw axes drawn</h4>
            <Segmented
              size="sm"
              label="Screw axes"
              value={axes}
              onChange={setAxes}
              options={[
                { value: 'home', label: 'At θ = 0 (the table)', title: 'Where each joint is in the zero configuration: what S_i describes' },
                { value: 'now', label: 'Where the joints are now', title: 'The axes carried along by the joints before them (faint: at θ = 0)' },
                { value: 'off', label: 'Hide' },
              ]}
            />
            <Rich
              className="kin3d-explain"
              text={
                axes === 'now'
                  ? 'Each axis rides with the joints before it (faint copies: where it was at $\\theta = 0$). These moving axes are the columns of the space Jacobian $J_s(\\theta)$; the PoE formula still uses the fixed $S_i$ because $e^{[S_1]\\theta_1}\\cdots$ carries them into place.'
                  : axes === 'home'
                    ? 'Axes stay where the joints are at $\\theta = 0$ even when you move the sliders: the table $S_i$ is always read at the zero configuration.'
                    : 'Axes hidden.'
              }
            />
            <div style={{ marginTop: 8 }}>
              <Toggle checked={showT} onChange={setShowT} label="Show the end-effector pose T(θ)" />
            </div>
          </section>
        </div>
      </div>

      <div className="kin3d-main" style={{ marginTop: 14 }}>
        <section className="kin3d-panel" aria-label={`Screw axis of joint ${sel + 1}`}>
          <h4>
            Joint {sel + 1}: {sj.type === 'R' ? 'revolute' : 'prismatic'}
          </h4>
          {sj.type === 'R' ? (
            <>
              <TeX display>{`\\omega_{${sel + 1}} = ${vecNumTeX(w)} = ${signedAxisTeX(w, 's')}`}</TeX>
              <TeX display>{`q_{${sel + 1}} = ${linVecTeXs(qSel)}\\ \\text{m}`}</TeX>
              <TeX display>{`v_{${sel + 1}} = -\\omega_{${sel + 1}} \\times q_{${sel + 1}} = ${linVecTeXs(vSel)} = ${vecNumTeX(linVecEval(vSel, vals))}\\ \\text{m}`}</TeX>
              {sideNote && <Rich className="kin3d-explain" text={`Shortcut from the notes: $${sideNote}$.`} />}
              <Slider
                label="slide q along the axis"
                tex="q + t\omega"
                tip="Moves the point q along the joint axis by t metres. Watch v: it does not change."
                value={qt}
                min={-0.8 * u}
                max={0.8 * u}
                step={0.01}
                format={(v) => `t = ${v.toFixed(2)} m`}
                onChange={(v) => (tween.stop(), setQt(v))}
              />
              <div className="kin3d-row">
                <Button size="sm" onClick={() => setFlips((f) => f.map((x, k) => (k === sel ? !x : x)))} title="Read the rotation arrow the other way: ω → −ω">
                  Flip ω{sel + 1}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => (tween.stop(), setQt(0))} disabled={qt === 0}>
                  q back to the joint
                </Button>
              </div>
              {flips[sel] && (
                <Callout kind="warn" title="ω flipped">
                  <Rich text={`You are now reading joint ${sel + 1}'s arrow the other way round, so $v$ flips too and $\\theta_{${sel + 1}}$ would be measured the other way. The drawn arc shows the positive sense for this $\\omega$.`} />
                </Callout>
              )}
            </>
          ) : (
            <>
              <TeX display>{`\\omega_{${sel + 1}} = (0,\\ 0,\\ 0), \\qquad v_{${sel + 1}} = ${vecNumTeX(sj.dir)}`}</TeX>
              <Rich
                className="kin3d-explain"
                text={`A prismatic joint does not rotate, so $\\omega = 0$, and $v$ is the unit direction of travel (${signedAxisTeX(sj.dir) === '\\mathbf{0}' ? '' : `$${signedAxisTeX(sj.dir)}$`}, the straight arrow on the housing). It has no axis *line*: sliding the whole joint sideways would not change $S_{${sel + 1}}$.`}
              />
            </>
          )}
          <TeX display>{`S_{${sel + 1}} = (\\omega_{${sel + 1}},\\ v_{${sel + 1}}) = ${vecNumTeX([...w, ...linVecEval(vSel, vals)])}`}</TeX>
        </section>

        <section className="kin3d-panel" aria-label="Screw axes at the zero configuration">
          <h4>All screw axes in {'{s}'} at θ = 0</h4>
          <ScrewList arm={arm} vals={vals} sel={sel} setSel={setSel} flips={flips} />
          {showT && (
            <div style={{ marginTop: 10 }}>
              <TeX display>{`T(\\theta) = e^{[S_1]\\theta_1}\\cdots e^{[S_{${n}}]\\theta_{${n}}} M = ${matTeX(T)}`}</TeX>
              <Rich
                className="kin3d-explain"
                text={
                  theta.every((x) => Math.abs(x) < 1e-9)
                    ? 'All joints are at zero, so every exponential is the identity and $T(0) = M$: the pose of {b} in {s} as drawn.'
                    : `The last column is the position of the {b} origin in {s} (m); the first three columns are $\\hat x_b, \\hat y_b, \\hat z_b$ written in {s}. Press **Zero configuration** and it becomes $M$.`
                }
              />
            </div>
          )}
        </section>
      </div>
    </>
  );
}

/** The {s} screw table (memoised: does not re-render while the sliders move). */
const ScrewList = memo(function ScrewList({ arm, vals, sel, setSel, flips }: { arm: ArmSpec; vals: Record<string, number>; sel: number; setSel: (i: number) => void; flips: boolean[] }) {
  return (
    <table className="kin3d-table">
      <thead>
        <tr>
          <th>i</th>
          <th>
            <TeX>{'\\omega_i'}</TeX>
          </th>
          <th>
            <TeX>{'v_i'}</TeX> (symbols)
          </th>
          <th>
            <TeX>{'v_i'}</TeX> (m, as drawn)
          </th>
        </tr>
      </thead>
      <tbody>
        {arm.joints.map((j, i) => {
          const rd = readJoint(arm, i, 's');
          const f = flips[i] && j.type === 'R';
          const w = f ? (rd.w.map((x) => -x) as Vec3) : rd.w;
          const v = f ? (rd.v.map(linNeg) as LinVec) : rd.v;
          return (
            <tr key={i} className={`is-click ${i === sel ? 'is-on' : ''}`} onClick={() => setSel(i)} tabIndex={0} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), setSel(i))} aria-label={`Select joint ${i + 1}`}>
              <td>
                {i + 1}
                <span className="kin3d-sub"> {j.type}</span>
              </td>
              <td>
                <TeX>{vecNumTeX(w)}</TeX>
              </td>
              <td>
                <TeX>{linVecTeXs(v)}</TeX>
              </td>
              <td>
                <TeX>{vecNumTeX(linVecEval(v, vals))}</TeX>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
});

const PredictBlock = memo(function PredictBlock({ api }: { api: MutableRefObject<ViewerApi> }) {
  return (
    <div className="kin3d-predicts">
      <PredictReveal
        id="kin-viewer-qslide"
        question="Slide the point $q$ along the selected joint's axis, a long way in either direction. What happens to $v = -\omega \times q$?"
        options={['Nothing: $v$ stays exactly the same', 'It grows as $q$ moves away from the joint', 'It flips sign when $q$ passes the joint', 'It becomes zero when $q$ is at the joint']}
        answer={0}
        explain="Moving $q$ to $q + t\omega$ changes $v$ by $-\omega \times t\omega = 0$, because a vector crossed with itself is zero. Only the axis *line* matters, not which point on it you picked. That is why the worked solutions pick whichever $q$ has the easiest numbers (2025 Q30 joint 5 uses $(0, 0, L_1)$ instead of the joint's own position)."
        tryIt="press Show me: q slides up and down the axis while the v readout stays put."
        onApply={() => api.current.slideQ?.()}
      />
      <PredictReveal
        id="kin-viewer-flip"
        question="You read a joint's rotation arrow the other way round, so you write $-\omega$ instead of $\omega$ (same point $q$). What happens to $v$?"
        options={['$v$ flips sign too', '$v$ is unchanged: it depends only on $q$', '$v$ becomes zero', 'Only the component of $v$ along $\\omega$ flips']}
        answer={0}
        explain="$v = -\omega \times q$ is linear in $\omega$, so $-\omega$ gives $-v$: the whole screw axis $S$ flips, and the joint angle is then measured the other way round. The notes' advice follows: flipping $\omega$ flips $v$, so if you misread an arrow but your working is consistent you lose less (2023 and 2024 worked solutions)."
        tryIt="press Show me: the axis arrow and the rotation arc reverse, and v changes sign in the panel."
        onApply={() => api.current.flip?.()}
      />
      <PredictReveal
        id="kin-viewer-home"
        question="Turn the first revolute joint by $90^\circ$. The joints after it move in space. Do their entries $S_2, \dots, S_n$ in the screw table change?"
        options={['No: the table is always read at the zero configuration', 'Yes: each $S_i$ must be recomputed at the new pose', 'Only $\\omega_i$ changes; $v_i$ stays', 'Only the prismatic joints change']}
        answer={0}
        explain="The space-form PoE $T(\theta) = e^{[S_1]\theta_1} \cdots e^{[S_n]\theta_n} M$ uses the screw axes **at $\theta = 0$**. The joints' current axes do move (solid lines, versus the faint ones at $\theta = 0$), and those moving axes are the columns of the space Jacobian, but the table never changes: the factor $e^{[S_1]\theta_1}$ carries every later joint into place."
        tryIt="press Show me: the first joint turns 90° with the axes shown where the joints are now; the faint lines are the table's axes."
        onApply={() => api.current.turnFirst?.()}
      />
    </div>
  );
});
