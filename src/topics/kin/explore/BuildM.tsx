// Build M like the exam (summary notes §6 steps 1–2; 2023 Q33a, 2024 Q30a, 2025 Q30a; review deck slide 20).
// The robot in the paper's oblique view with {s} and {b}. The student picks where x̂_b, ŷ_b and ẑ_b point in
// {s} (buttons, or the {s} arrows drawn at the {b} origin), types p (symbols or numbers), and watches R and M
// assemble with a live det R = +1 check, per-entry feedback, a cross-product completion and a reveal that
// explains each column in the paper's words ("drawn up-right = into the page").
import { memo, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type MutableRefObject } from 'react';
import type { ExploreItem } from '../../../engine/types';
import { cross3, linStr, linTeX, linVecEval, type ArmSpec, type Vec3 } from '../../../core/kin';
import { Button, Callout, LinkButton, More } from '../../../ui/kit';
import { PredictReveal } from '../../../ui/PredictReveal';
import { Rich, TeX } from '../../../ui/Rich';
import { href } from '../../../app/router';
import { AxisLegend, ArmPicker, Kin3DView, ViewBar, revealView, triad, triadLabels, useArmChoice, useTween, type ArmRenderer, type Extra, type Label, type ViewMode } from './kin3dScene';
import {
  AXIS_VARS,
  SIGNED_AXES,
  armBounds,
  axisById,
  checkLenCell,
  columnsOf,
  drawnDiagonally,
  handedness,
  matTeX,
  paperWords,
  signedAxisOf,
  signedAxisTeX,
  valuesText,
  type CellState,
  type SignedAxis,
} from './kin3dMath';

export const meta: Omit<ExploreItem, 'component'> = {
  id: 'build-m',
  title: 'Build M: read the frames like the exam',
  summary:
    'The paper’s drawing of {s} and {b}, in the exam’s oblique view and in 3D. Choose where $\\hat x_b$, $\\hat y_b$ and $\\hat z_b$ point in {s} and read off $p$; the matrix assembles itself and checks $\\det R = +1$.',
  notice:
    'The columns of $R$ are $\\hat x_b, \\hat y_b, \\hat z_b$ written in {s} coordinates, and $p$ is where the {b} origin is. An arrow drawn diagonally points into or out of the page.',
  minutes: 7,
};

type AxisId = SignedAxis['id'];
interface BuildApi {
  diagonal?: () => void;
  cross?: () => void;
  pcomp?: () => void;
}

const I3 = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];
const COL_TEX = ['\\hat{x}_b', '\\hat{y}_b', '\\hat{z}_b'];

/** A signed axis in brackets when negative, for products: (−ẑ_s) × (−x̂_s). */
const par = (t: string) => (t.startsWith('-') ? `(${t})` : t);

/** Typed cell → TeX for the live matrix (L2 → L_2; anything odd shown as a box). */
function typedTeX(s: string): string {
  const t = s.replace(/\s+/g, '').replace(/[−–]/g, '-');
  if (!t) return '\\square';
  if (!/^[A-Za-z0-9+\-*/().]+$/.test(t)) return '\\text{?}';
  return t.replace(/\*/g, '').replace(/([A-Za-z])_?(\d+)/g, '$1_{$2}');
}

export default function BuildM() {
  const choice = useArmChoice('rprr-2023');
  const [mode, setMode] = useState<ViewMode>('exam');
  const api = useRef<BuildApi>({});
  const pending = useRef<((a: BuildApi) => void) | null>(null);
  const choiceRef = useRef(choice);
  choiceRef.current = choice;
  const root = useRef<HTMLDivElement>(null);
  const apply = useCallback((armId: string, fn: (a: BuildApi) => void) => {
    revealView(root.current);
    const c = choiceRef.current;
    if (c.id === armId) fn(api.current);
    else {
      pending.current = fn;
      c.setId(armId);
    }
  }, []);
  return (
    <div className="kin3d" ref={root}>
      <div className="kin3d-toolbar">
        <ArmPicker choice={choice} />
        <span className="kin3d-sub">{choice.arm.source}</span>
      </div>
      <BuildInner key={choice.arm.id} arm={choice.arm} vals={choice.vals} mode={mode} setMode={setMode} api={api} pending={pending} />
      <PredictBlock apply={apply} />
      <More label="How to build M in the exam (summary notes §6, steps 1–2)">
        <Rich
          text={`1. **Fix the axes of {s}.** Note which arrow points out of the page. On these papers $\\hat x_s$ (2023, 2024) or $\\hat y_s$ (2025, into the page) is drawn **diagonally**: down-left means out of the page, up-right means into it.
2. **For each axis of {b}, say where it points in {s}:** "down" is $-\\hat z_s$, "into the page" is $-\\hat x_s$ (when $\\hat x_s$ comes out of it). Those signed unit vectors are the columns of $R$, in the order $\\hat x_b, \\hat y_b, \\hat z_b$.
3. **Check it is right-handed:** $\\hat x_b \\times \\hat y_b = \\hat z_b$, i.e. $\\det R = +1$. If you get $-1$, one axis is flipped: re-read the one drawn diagonally. You can also use the cross product to *get* the third column from the first two.
4. **p** is the position of the {b} origin: walk from {s} along $\\hat x_s$, then $\\hat y_s$, then $\\hat z_s$ and add up the link lengths with signs.
5. Write $M = \\begin{bmatrix} R & p \\\\ 0 & 1 \\end{bmatrix}$. It is the pose of {b} at the zero configuration, so read it from the figure exactly as drawn.

Why columns? $R$ maps {b} coordinates to {s} coordinates: $R\\,(1, 0, 0)^T$ is the first column, and it must be $\\hat x_b$ written in {s}.`}
        />
        <div className="kin3d-row" style={{ marginTop: 8 }}>
          <LinkButton href={href(['kin', 'solve', 'kin-m'], { t: 2 })} variant="primary">
            Practise: M for a new robot (exam style)
          </LinkButton>
        </div>
      </More>
    </div>
  );
}

function BuildInner({
  arm,
  vals,
  mode,
  setMode,
  api,
  pending,
}: {
  arm: ArmSpec;
  vals: Record<string, number>;
  mode: ViewMode;
  setMode: (m: ViewMode) => void;
  api: MutableRefObject<BuildApi>;
  pending: MutableRefObject<((a: BuildApi) => void) | null>;
}) {
  const [r, setR] = useState<ArmRenderer | null>(null);
  const [picks, setPicks] = useState<(AxisId | null)[]>([null, null, null]);
  const [active, setActive] = useState<0 | 1 | 2 | null>(0);
  const [pTyped, setPTyped] = useState(['', '', '']);
  const [checked, setChecked] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [hover, setHover] = useState<string | null>(null);
  const [showPath, setShowPath] = useState(false);
  const tween = useTween();
  const bounds = useMemo(() => armBounds(arm, vals), [arm, vals]);
  const u = bounds.size;
  const truth = useMemo(() => columnsOf(arm.R), [arm]);
  const p = useMemo(() => linVecEval(arm.p, vals), [arm, vals]);
  const cols = picks.map((id) => (id ? axisById(id)!.v : null));
  const hand = cols[0] && cols[1] && cols[2] ? handedness(cols[0], cols[1], cols[2]) : null;
  const colOk = picks.map((id, j) => id !== null && id === truth[j]?.id);
  const pState: CellState[] = pTyped.map((t, k) => checkLenCell(t, arm.p[k], arm.symbols, vals));
  const allOk = colOk.every(Boolean) && pState.every((s) => s === 'ok');
  const tl = 0.3 * u;
  const rose = 0.25 * u;

  const pick = (j: number, id: AxisId) => {
    setPicks((ps) => ps.map((x, k) => (k === j ? id : x)));
    const next = [0, 1, 2].find((k) => k !== j && !picks[k]);
    setActive(next === undefined ? null : (next as 0 | 1 | 2));
  };

  // --- scene
  useEffect(() => {
    if (!r) return;
    r.setArm(arm, vals);
    r.setView(mode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r, arm, vals]);
  useEffect(() => {
    if (!r) return;
    const ex: Extra[] = [];
    const lb: Label[] = [];
    ex.push(...triad([0, 0, 0], I3, tl, 0));
    lb.push(...triadLabels('s', [0, 0, 0], I3, tl, 's'));
    for (let k = 0; k < 3; k++) {
      const dir: Vec3 = [arm.R[0][k], arm.R[1][k], arm.R[2][k]];
      const on = active === k;
      ex.push({ kind: 'arrow', from: p, dir, len: tl, color: AXIS_VARS[k], opacity: active === null || on ? 1 : 0.35, r: on ? 0.017 * u : undefined });
      lb.push({ key: `b${k}`, tex: COL_TEX[k], at: [p[0] + tl * dir[0], p[1] + tl * dir[1], p[2] + tl * dir[2]], from: p, color: `var(${AXIS_VARS[k]})`, cls: on ? 'is-tag' : active === null ? '' : 'is-dim' });
    }
    if (active !== null && !revealed)
      for (const a of SIGNED_AXES) {
        const id = `pick:${a.id}`;
        const hot = hover === id || picks[active] === a.id;
        ex.push({ kind: 'arrow', from: p, dir: a.v, len: rose, color: AXIS_VARS[a.axis], opacity: hot ? 0.95 : 0.45, r: 0.0055 * u });
        lb.push({ key: id, tex: signedAxisTeX(a.v, 's'), at: [p[0] + rose * a.v[0], p[1] + rose * a.v[1], p[2] + rose * a.v[2]], from: p, color: `var(${AXIS_VARS[a.axis]})`, cls: `is-pick ${hot ? 'is-hot' : ''}` });
      }
    if (showPath) {
      // walk from {s} to the {b} origin along x̂s, then ŷs, then ẑs
      let at: Vec3 = [0, 0, 0];
      for (let k = 0; k < 3; k++) {
        if (Math.abs(p[k]) < 1e-9) continue;
        const to: Vec3 = [at[0], at[1], at[2]];
        to[k] = p[k];
        ex.push({ kind: 'dash', from: at, to, color: AXIS_VARS[k] });
        ex.push({ kind: 'point', at: to, color: AXIS_VARS[k], r: 0.012 * u });
        const mid: Vec3 = [(at[0] + to[0]) / 2, (at[1] + to[1]) / 2, (at[2] + to[2]) / 2];
        lb.push({ key: `path${k}`, tex: `p_${'xyz'[k]} = ${linTeX(arm.p[k])}`, at: mid, color: `var(${AXIS_VARS[k]})`, cls: 'is-tag' });
        at = to;
      }
    }
    r.setExtras(ex);
    r.setLabels(lb);
  }, [r, arm, p, u, tl, rose, active, hover, picks, revealed, showPath]);
  useEffect(() => {
    if (!r) return;
    r.setInteraction({
      hit: (x, y) => {
        let best: string | null = null;
        let bd = 18;
        const test = (id: string, pt: Vec3) => {
          const s = r.project(pt);
          if (!s) return;
          const d = Math.hypot(s.x - x, s.y - y);
          if (d < bd) {
            bd = d;
            best = id;
          }
        };
        if (active !== null && !revealed) for (const a of SIGNED_AXES) test(`pick:${a.id}`, [p[0] + rose * a.v[0], p[1] + rose * a.v[1], p[2] + rose * a.v[2]]);
        for (let k = 0; k < 3; k++) test(`arm:${k}`, [p[0] + tl * arm.R[0][k], p[1] + tl * arm.R[1][k], p[2] + tl * arm.R[2][k]]);
        return best;
      },
      click: (id) => {
        if (id.startsWith('pick:') && active !== null) pick(active, id.slice(5) as AxisId);
        else if (id.startsWith('arm:')) setActive(Number(id.slice(4)) as 0 | 1 | 2);
      },
      hover: setHover,
    });
    return () => r.setInteraction(null);
  });

  // --- predictions
  api.current.diagonal = () => {
    setActive(1);
    setMode('orbit');
    r?.flyNamed('top');
  };
  api.current.cross = () => {
    setRevealed(false);
    setPicks(['-z', '-x', null]);
    setActive(2);
    tween.run(900, () => undefined, () => setPicks(['-z', '-x', '+y']));
  };
  api.current.pcomp = () => {
    setShowPath(true);
    setMode('orbit');
    r?.flyNamed('side');
  };
  useEffect(() => {
    if (r && pending.current) {
      const f = pending.current;
      pending.current = null;
      window.setTimeout(() => f(api.current), 60);
    }
  }, [r, api, pending]);

  // --- matrix and messages
  const cross01 = cols[0] && cols[1] ? cross3(cols[0], cols[1]) : null;
  const crossAxis = cross01 ? signedAxisOf(cross01) : null;
  const Mtex = matTeX(
    [0, 1, 2]
      .map((i) => [...[0, 1, 2].map((j) => (cols[j] ? String(cols[j]![i]) : null)), typedTeX(pTyped[i])])
      .concat([['0', '0', '0', '1']]) as (string | null)[][]
  );

  const colMsg = (j: number): string => {
    const id = picks[j];
    const t = truth[j];
    if (!id || !t) return '';
    const a = axisById(id)!;
    if (a.id === t.id) return `✓ $${COL_TEX[j]} = ${signedAxisTeX(t.v)}$: it points ${paperWords(t.v, arm.view)}.`;
    if (a.axis === t.axis)
      return `✗ $${COL_TEX[j]}$: right axis, wrong sign.${drawnDiagonally(t.v, arm.view) ? ' It is drawn diagonally: up-right is *into* the page, down-left is *out of* it.' : ' Check which way the arrow head points.'}`;
    return `✗ $${COL_TEX[j]}$ is not along $${signedAxisTeX(a.v, 's', false).replace(/^-/, '')}$. Is it drawn left–right, up–down, or diagonally (into or out of the page)?`;
  };
  const pMsg = (k: number): string => {
    const s = pState[k];
    const sym = `p_${'xyz'[k]}`;
    if (s === 'ok') return '';
    if (s === 'empty') return `$${sym}$ is empty (write 0 for zero).`;
    if (s === 'invalid') return `Cannot read $${sym}$: use numbers or ${arm.symbols.join(', ')}, e.g. \`-${arm.symbols[0]}\`.`;
    if (s === 'neg') return `✗ $${sym}$ has the wrong sign: which way along $\\hat ${'xyz'[k]}_s$ is the {b} origin from {s}?`;
    return `✗ $${sym}$ is off: walk from {s} to {b} along $\\hat ${'xyz'[k]}_s$ and add the link lengths that point that way (with signs).`;
  };

  const reveal = () => {
    setPicks(truth.map((t) => (t ? t.id : null)));
    setPTyped(arm.p.map((c) => linStr(c)));
    setRevealed(true);
    setChecked(true);
    setShowPath(true);
    setActive(null);
  };
  const clear = () => {
    setPicks([null, null, null]);
    setPTyped(['', '', '']);
    setChecked(false);
    setRevealed(false);
    setShowPath(false);
    setActive(0);
  };

  const hint = mode === 'exam' ? 'Exam view: an arrow drawn down-left comes out of the page; up-right goes into it.' : 'Drag to rotate · wheel to zoom';
  const fr = arm.frames ? `{s} = ${arm.frames.s}, {b} = ${arm.frames.b}` : '';

  return (
    <>
      <div className="kin3d-main">
        <div>
          <Kin3DView onReady={setR} height={500} label={`The ${arm.name} at its zero configuration with frames {s} and {b}; click a {b} axis, then one of the {s} arrows drawn at the {b} origin`} hint={hint}>
            <ViewBar r={r} mode={mode} setMode={setMode} />
            {fr && <div className="kin3d-corner">{fr}</div>}
          </Kin3DView>
          <AxisLegend
            extra={
              <>
                {active !== null && !revealed && <span>Thin arrows at {'{b}'}: the six {'{s}'} directions to choose from (click one).</span>}
                <span className="kin3d-sub">Drawn with {valuesText(arm, vals)}.</span>
              </>
            }
          />
        </div>

        <div className="kin3d-col">
          <section className="kin3d-panel" aria-label="Columns of R">
            <h4>1 · Columns of R: where does each {'{b}'} axis point in {'{s}'}?</h4>
            {[0, 1, 2].map((j) => (
              <div key={j} className={`kin3d-joint ${active === j ? 'is-on' : ''}`} onClick={() => setActive(j as 0 | 1 | 2)} style={{ marginBottom: 4 }}>
                <div className="kin3d-row" style={{ justifyContent: 'space-between' }}>
                  <TeX>{`${COL_TEX[j]} =`}</TeX>
                  <span className="kin3d-sub">{active === j ? 'choose below or click an arrow in the view' : picks[j] ? '' : 'click to choose'}</span>
                </div>
                <div className="kin3d-axbtns" style={{ gridTemplateColumns: 'repeat(6, minmax(0, 1fr))', marginTop: 3 }}>
                  {SIGNED_AXES.map((a) => {
                    const on = picks[j] === a.id;
                    const verdict = checked && on ? (colOk[j] ? 'is-right' : 'is-wrong') : '';
                    return (
                      <button
                        key={a.id}
                        type="button"
                        className={`kin3d-axbtn ${on ? 'is-on' : ''} ${verdict}`}
                        style={{ '--ax': `var(${AXIS_VARS[a.axis]})` } as CSSProperties}
                        aria-pressed={on}
                        aria-label={`${COL_TEX[j].replace(/\\hat\{(.)\}_b/, '$1-hat b')} = ${a.id} s`}
                        onClick={(e) => {
                          e.stopPropagation();
                          pick(j, a.id);
                        }}
                      >
                        <TeX>{signedAxisTeX(a.v, 's')}</TeX>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            <div className="kin3d-row" style={{ marginTop: 6 }}>
              <Button size="sm" disabled={!crossAxis} onClick={() => crossAxis && (setPicks((ps) => [ps[0], ps[1], crossAxis.id]), setActive(null))} title="Right-handed frames satisfy x̂ × ŷ = ẑ">
                Fill <TeX>{'\\hat z_b = \\hat x_b \\times \\hat y_b'}</TeX>
              </Button>
            </div>
          </section>

          <section className="kin3d-panel" aria-label="Position p">
            <h4>2 · p: the origin of {'{b}'} in {'{s}'}</h4>
            <div className="kin3d-row">
              <TeX>{'p = ('}</TeX>
              {[0, 1, 2].map((k) => (
                <span key={k} className="kin3d-cells">
                  <input
                    className={`kin3d-cell is-wide ${checked && pState[k] !== 'empty' ? `is-${pState[k]}` : ''}`}
                    value={pTyped[k]}
                    placeholder={`p${'xyz'[k]}`}
                    aria-label={`p ${'xyz'[k]} component`}
                    spellCheck={false}
                    onChange={(e) => {
                      const v = e.target.value;
                      setPTyped((ps) => ps.map((x, i) => (i === k ? v : x)));
                    }}
                    onKeyDown={(e) => e.key === 'Enter' && setChecked(true)}
                  />
                  {k < 2 && <span className="kin3d-paren">,</span>}
                </span>
              ))}
              <TeX>{')'}</TeX>
            </div>
            <p className="kin3d-sub" style={{ margin: '6px 0 0' }}>
              Symbols ({arm.symbols.join(', ')}), e.g. <code>-{arm.symbols[0]}</code> or <code>{arm.symbols.slice(0, 2).join('+')}</code>, or numbers in metres as drawn.
            </p>
          </section>
        </div>
      </div>

      <section className="kin3d-panel" style={{ marginTop: 14 }} aria-label="The assembled M">
        <h4>3 · M as you have it</h4>
        <div className="kin3d-mats">
          <div className="kin3d-mat">
            <TeX display>{`M = \\begin{bmatrix} R & p \\\\ 0 & 1 \\end{bmatrix} = ${Mtex}`}</TeX>
          </div>
          <div style={{ minWidth: 260, flex: 1 }}>
            {hand === null ? (
              <span className="kin3d-status is-muted">Pick all three columns to check det R</span>
            ) : hand === 'right' ? (
              <span className="kin3d-status is-ok">✓ det R = +1: right-handed</span>
            ) : hand === 'left' ? (
              <span className="kin3d-status is-bad">✗ det R = −1: left-handed</span>
            ) : (
              <span className="kin3d-status is-bad">✗ det R = 0: two columns are parallel</span>
            )}
            {hand === 'left' && <Rich className="kin3d-explain" text="No real frame is left-handed, so one column has the wrong sign. Re-read the axis you are least sure of: usually the one drawn diagonally." />}
            {hand === 'degenerate' && <Rich className="kin3d-explain" text="Each {s} direction can be used by only one column: the three axes of {b} are perpendicular." />}
            {cross01 && cols[2] && hand === 'right' && <Rich className="kin3d-explain" text={`Check: $\\hat x_b \\times \\hat y_b = ${par(signedAxisTeX(cols[0]!))} \\times ${par(signedAxisTeX(cols[1]!))} =${signedAxisTeX(cross01)} = \\hat z_b$.`} />}
            <div className="kin3d-row" style={{ marginTop: 8 }}>
              <Button variant="primary" size="sm" onClick={() => setChecked(true)}>
                Check M
              </Button>
              <Button size="sm" onClick={reveal}>
                Reveal
              </Button>
              <Button size="sm" variant="ghost" onClick={clear}>
                Clear
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setShowPath((s) => !s)}>
                {showPath ? 'Hide' : 'Show'} the walk to p
              </Button>
            </div>
          </div>
        </div>
        {checked && !revealed && (
          <div style={{ marginTop: 8 }}>
            {allOk ? (
              <Callout kind="ok" title="M is right">
                <Rich text={`All three columns and $p$ match the figure.${pTyped.some((t, k) => !/[a-z]/i.test(t) && Object.keys(arm.p[k]).some((x) => x !== '1')) ? ' In the exam, write $p$ in the length symbols, as the figure gives them.' : ''}`} />
              </Callout>
            ) : (
              <ul className="kin3d-explain" style={{ paddingLeft: 18, margin: '4px 0' }}>
                {[0, 1, 2].map((j) => (picks[j] ? <li key={`c${j}`}><Rich text={colMsg(j)} inline /></li> : <li key={`c${j}`}><Rich text={`$${COL_TEX[j]}$ not chosen yet.`} inline /></li>))}
                {[0, 1, 2].map((k) => (pMsg(k) ? <li key={`p${k}`}><Rich text={pMsg(k)} inline /></li> : null))}
              </ul>
            )}
          </div>
        )}
        {revealed && (
          <Callout kind="info" title="Reading the figure">
            <Rich
              text={[0, 1, 2]
                .map((j) => (truth[j] ? `- $${COL_TEX[j]}$ points ${paperWords(truth[j]!.v, arm.view)}, so it is $${signedAxisTeX(truth[j]!.v)}$${drawnDiagonally(truth[j]!.v, arm.view) ? ' (drawn diagonally: this is the trap)' : ''}.` : ''))
                .concat([
                  `- Check: $\\hat x_b \\times \\hat y_b = ${par(signedAxisTeX(truth[0]!.v))} \\times ${par(signedAxisTeX(truth[1]!.v))} =${signedAxisTeX(cross3(truth[0]!.v, truth[1]!.v))} = \\hat z_b$, so $\\det R = +1$.`,
                  `- $p = (${arm.p.map(linTeX).join(',\\ ')})$: the dashed walk goes along $\\hat x_s$, then $\\hat y_s$, then $\\hat z_s$ from {s} to the {b} origin.`,
                ])
                .join('\n')}
            />
          </Callout>
        )}
      </section>
    </>
  );
}

const PredictBlock = memo(function PredictBlock({ apply }: { apply: (armId: string, fn: (a: BuildApi) => void) => void }) {
  return (
    <div className="kin3d-predicts">
      <PredictReveal
        id="kin-buildm-diagonal"
        question="In the 2023 figure (RPRR arm), $\hat y_b$ is drawn as a short arrow pointing up and to the right. $\hat x_s$ is drawn down-left. Which {s} direction is $\hat y_b$?"
        options={['$+\\hat y_s$: to the right', '$+\\hat x_s$: out of the page', '$-\\hat x_s$: into the page', '$+\\hat z_s$: up']}
        answer={2}
        explain="On the paper the out-of-page axis $\hat x_s$ is drawn down-left, so the opposite direction, into the page, is drawn up-right: $\hat y_b = -\hat x_s$. Reading a diagonal arrow as 'right' or 'up' is the classic M mistake (the worked solution's check: $\hat x_b \times \hat y_b = (-\hat z_s) \times (-\hat x_s) = \hat y_s = \hat z_b$)."
        tryIt="press Show me: the camera swings round to look from above, and ŷ_b is seen pointing straight into the page."
        onApply={() => apply('rprr-2023', (a) => a.diagonal?.())}
      />
      <PredictReveal
        id="kin-buildm-cross"
        question="You have read $\hat x_b = -\hat z_s$ and $\hat y_b = -\hat x_s$ off the 2023 figure. Without looking at the figure again, what must $\hat z_b$ be?"
        options={['$-\\hat y_s$', '$+\\hat y_s$', '$+\\hat x_s$', 'It cannot be found without the figure']}
        answer={1}
        explain="Frames are right-handed, so $\hat z_b = \hat x_b \times \hat y_b = (-\hat z_s) \times (-\hat x_s) = \hat z_s \times \hat x_s = \hat y_s$. Two columns fix the third; use this to fill or check the column you are least sure of, and to keep $\det R = +1$."
        tryIt="press Show me: the first two columns are filled and the cross product fills the third, with the det R check."
        onApply={() => apply('rprr-2023', (a) => a.cross?.())}
      />
      <PredictReveal
        id="kin-buildm-p"
        question="2024 camera boom: from the top of the post at $(0, 0, L_1)$, a short link goes right by $L_2$, then the boom runs **into the page** by $L_3$ to the camera {b}. $\hat x_s$ comes out of the page. What is $p$?"
        options={['$(L_3,\\ L_2,\\ L_1)$', '$(0,\\ L_2 + L_3,\\ L_1)$', '$(L_2,\\ -L_3,\\ L_1)$', '$(-L_3,\\ L_2,\\ L_1)$']}
        answer={3}
        explain="Into the page is $-\hat x_s$, so the boom contributes $-L_3$ to $p_x$; right is $+\hat y_s$ ($L_2$) and up is $+\hat z_s$ ($L_1$): $p = (-L_3, L_2, L_1)$, as in the 2024 worked solution. The camera therefore sits *behind* the base along $\hat x_s$, which matters in part (c) when you work out the depth $Z$."
        tryIt="press Show me: the dashed walk from {s} to {b} is drawn, seen from the side so the into-the-page leg is visible."
        onApply={() => apply('prr-2024', (a) => a.pcomp?.())}
      />
    </div>
  );
});
