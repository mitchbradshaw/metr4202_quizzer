// Classifier sequence and the gripper decision (classifier): the 2025 Q28 fruit classifier. An editable confusion
// table P(detected | true), the current belief, buttons that add detections (A / B / N) one frame at a time with
// the hand table of every update, and a decision panel: the expected grasp success of each gripper,
// Σ_x P(success | g, x) P(x), drawn as bars that flip as the belief changes. "Exam preset" loads the paper.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ExploreItem } from '../../../engine/types';
import { classifierRun, decide } from '../../../core/bayestables';
import { Button, More, Segmented } from '../../../ui/kit';
import { PredictReveal } from '../../../ui/PredictReveal';
import { Rich } from '../../../ui/Rich';
import { EXAM_2025 } from '../solve/classifier';
import { BayesLayout, HandTable, NumCell, Panel, f2, f3, f4, revealVisual, useTween } from './common';
import { setLikAt, setPriorAt } from './bayesRuleModel';

export const meta: Omit<ExploreItem, 'component'> = {
  id: 'classifier',
  title: 'Classifier sequence and the gripper decision (2025 Q28)',
  summary:
    'A camera labels the fruit under the arm A, B or N with the confusion table on the right. Every detection multiplies the belief by one **column** of that table and renormalises; the posterior after each frame is the prior for the next. The decision panel turns the belief into an action: use the gripper with the larger expected success $\\sum_x P(\\text{success} \\mid g, x)\\,P(x)$.',
  notice:
    'One “A” almost cancels a “B”, because the camera rarely says A when it is looking at a banana (0.05). And the gripper is chosen by **expected success**, which can favour suction even when banana is (just) the most likely fruit.',
  minutes: 8,
};

const CLS = ['A', 'B', 'N'];
const NAMES = ['Apple', 'Banana', 'None'];
const COL = ['var(--m1)', 'var(--m2)', 'var(--m3)'];
const GRIPPERS = ['suction', 'pinch'];

// timeline geometry
const VW = 600;
const TOP = 24;
const BH = 180;
const BW = 46;
const PITCH = 78;
const X0 = 44;
const MAXBARS = 7;
const VH = TOP + BH + 46;

const clone = (m: number[][]) => m.map((r) => r.slice());

export default function Classifier() {
  const [table, setTable] = useState<number[][]>(() => clone(EXAM_2025.table));
  const [prior, setPrior] = useState<number[]>(() => EXAM_2025.prior.slice());
  const [success, setSuccess] = useState<number[][]>(() => clone(EXAM_2025.success));
  const [seq, setSeq] = useState<number[]>([]);
  const [sel, setSel] = useState<number | null>(null);
  const [hoverCol, setHoverCol] = useState<number | null>(null);
  const leftRef = useRef<HTMLDivElement>(null);
  const timers = useRef<number[]>([]);
  const tween = useTween();

  const tables = useMemo(() => classifierRun(prior, table, seq), [prior, table, seq]);
  const beliefs = useMemo(() => [prior, ...tables.map((t) => (t.evidence > 0 ? t.posterior : t.prior))], [prior, tables]);
  const decisions = useMemo(() => beliefs.map((b) => decide(b, success)), [beliefs, success]);
  const last = beliefs.length - 1;
  const at = sel === null ? last : Math.min(sel, last);
  const dec = decisions[at];
  const upd = at > 0 ? tables[at - 1] : null;
  const shownCol = hoverCol ?? (upd ? seq[at - 1] : null);

  // ---------------------------------------------------------------- actions
  const clearTimers = () => {
    timers.current.forEach((id) => window.clearTimeout(id));
    timers.current = [];
  };
  useEffect(() => clearTimers, []);
  const detect = (d: number) => {
    setSeq((s) => [...s, d]);
    setSel(null);
  };
  const undo = () => {
    clearTimers();
    setSeq((s) => s.slice(0, -1));
    setSel(null);
  };
  const reset = () => {
    clearTimers();
    setSeq([]);
    setSel(null);
  };
  const loadExam = () => {
    clearTimers();
    setTable(clone(EXAM_2025.table));
    setPrior(EXAM_2025.prior.slice());
    setSuccess(clone(EXAM_2025.success));
    setSeq([]);
    setSel(null);
  };
  /** Play a sequence of detections one frame at a time (from the current prior). */
  const runSeq = (ds: number[], gap = 900) => {
    clearTimers();
    setSeq([]);
    setSel(null);
    ds.forEach((d, k) => {
      timers.current.push(window.setTimeout(() => setSeq((s) => [...s, d]), 250 + k * gap));
    });
  };
  const setup = (fn: () => void) => {
    fn();
    revealVisual(leftRef.current);
  };

  // ---------------------------------------------------------------- the newest bar grows out of the previous one
  const barRefs = useRef<(SVGRectElement | null)[][]>([]);
  const prevLen = useRef(beliefs.length);
  useLayoutEffect(() => {
    const grew = beliefs.length > prevLen.current;
    prevLen.current = beliefs.length;
    if (!grew || beliefs.length < 2) return;
    const k = Math.min(beliefs.length, MAXBARS) - 1; // slot of the newest bar
    const from = beliefs[beliefs.length - 2];
    const to = beliefs[beliefs.length - 1];
    tween(650, (p) => {
      let acc = 0;
      for (let i = 0; i < 3; i++) {
        const v = from[i] + (to[i] - from[i]) * p;
        const el = barRefs.current[k]?.[i];
        if (el) {
          el.setAttribute('y', String(TOP + BH - (acc + v) * BH));
          el.setAttribute('height', String(Math.max(0, v * BH)));
        }
        acc += v;
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [beliefs]);

  // ---------------------------------------------------------------- timeline
  const first = Math.max(0, beliefs.length - MAXBARS);
  const shown = beliefs.slice(first);
  const timeline = (
    <svg className="bayes-cls-svg" viewBox={`0 0 ${VW} ${VH}`} width="100%" role="group" aria-label={`Belief after each frame: ${beliefs.map((b, k) => `${k === 0 ? 'prior' : `after ${CLS[seq[k - 1]]}`} A ${f3(b[0])}, B ${f3(b[1])}, N ${f3(b[2])}`).join('; ')}`}>
      {[0, 0.5, 1].map((v) => (
        <g key={v}>
          <line x1={X0 - 4} x2={VW - 6} y1={TOP + BH - v * BH} y2={TOP + BH - v * BH} className="bayes-gridline" />
          <text x={X0 - 8} y={TOP + BH - v * BH + 4} textAnchor="end" className="bayes-tick">
            {v}
          </text>
        </g>
      ))}
      {first > 0 && (
        <text x={X0 - 30} y={TOP + BH + 16} className="bayes-tick">
          …
        </text>
      )}
      {shown.map((b, j) => {
        const k = first + j;
        const x = X0 + j * PITCH;
        const isSel = k === at;
        let acc = 0;
        return (
          <g
            key={k}
            className="bayes-cls-bar"
            role="button"
            tabIndex={0}
            aria-pressed={isSel}
            aria-label={`${k === 0 ? 'Prior' : `After detection ${k} (${CLS[seq[k - 1]]})`}: A ${f3(b[0])}, B ${f3(b[1])}, N ${f3(b[2])}. Show its table and decision.`}
            onClick={() => setSel(k === last ? null : k)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setSel(k === last ? null : k);
              }
            }}
          >
            <title>{`${k === 0 ? 'prior' : `after ${CLS[seq[k - 1]]}`}: A ${f4(b[0])}, B ${f4(b[1])}, N ${f4(b[2])} (click to inspect)`}</title>
            {b.map((v, i) => {
              const y = TOP + BH - (acc + v) * BH;
              acc += v;
              return (
                <rect
                  key={i}
                  ref={(el) => {
                    (barRefs.current[j] ??= [])[i] = el;
                  }}
                  x={x}
                  y={y}
                  width={BW}
                  height={Math.max(0, v * BH)}
                  fill={COL[i]}
                  stroke="var(--surface)"
                  strokeWidth={1}
                />
              );
            })}
            {(() => {
              let a2 = 0;
              return b.map((v, i) => {
                const yc = TOP + BH - (a2 + v / 2) * BH;
                a2 += v;
                return v * BH >= 15 ? (
                  <text key={`t${i}`} x={x + BW / 2} y={yc + 4} textAnchor="middle" className="bayes-rule-in">
                    {f2(v)}
                  </text>
                ) : null;
              });
            })()}
            {isSel && <rect x={x - 3} y={TOP - 3} width={BW + 6} height={BH + 6} fill="none" stroke="var(--accent)" strokeWidth={2.5} rx={3} />}
            <text x={x + BW / 2} y={TOP + BH + 15} textAnchor="middle" className="bayes-axis-label">
              {k === 0 ? 'prior' : `after ${CLS[seq[k - 1]]}`}
            </text>
            <text x={x + BW / 2} y={TOP + BH + 31} textAnchor="middle" className="bayes-tick bayes-cls-best">
              {`${GRIPPERS[decisions[k].best]}`}
            </text>
          </g>
        );
      })}
      {shown.slice(1).map((_, j) => {
        const k = first + j + 1;
        const x1 = X0 + j * PITCH + BW + 4;
        const x2 = X0 + (j + 1) * PITCH - 4;
        const ym = TOP + BH / 2;
        return (
          <g key={`a${k}`} pointerEvents="none">
            <line x1={x1} x2={x2 - 4} y1={ym} y2={ym} stroke="var(--text-2)" strokeWidth={1.4} />
            <path d={`M${x2} ${ym} l-6 -4 v8 z`} fill="var(--text-2)" />
            <circle cx={(x1 + x2) / 2} cy={ym - 15} r={10} fill="var(--surface)" stroke={COL[seq[k - 1]]} strokeWidth={2} />
            <text x={(x1 + x2) / 2} y={ym - 11} textAnchor="middle" className="bayes-cls-z">
              {CLS[seq[k - 1]]}
            </text>
          </g>
        );
      })}
      <text x={VW - 6} y={TOP + BH + 31} textAnchor="end" className="bayes-tick">
        best gripper ↑
      </text>
    </svg>
  );

  const expBars = (
    <div className="bayes-cls-dec" aria-live="polite">
      {GRIPPERS.map((g, gi) => {
        const e = dec.expected[gi];
        const best = gi === dec.best;
        return (
          <div key={g} className={`bayes-cls-dec-row ${best ? 'is-best' : ''}`}>
            <span className="bayes-cls-dec-name">
              {best ? '★ ' : ''}
              {g}
            </span>
            <span className="bayes-cls-dec-track" aria-hidden="true">
              {beliefs[at].map((p, i) => (
                <span key={i} className="bayes-cls-dec-seg" style={{ width: `${p * success[gi][i] * 100}%`, background: COL[i] }} />
              ))}
            </span>
            <span className="mono bayes-cls-dec-val">{f3(e)}</span>
            <Rich
              className="small muted bayes-cls-dec-sum"
              text={`$${success[gi].map((s, i) => `${f2(s)}(${f4(beliefs[at][i])})`).join(' + ')} = ${f4(e)}$`}
            />
          </div>
        );
      })}
    </div>
  );

  const left = (
    <div ref={leftRef} className="bayes-panel bayes-left-stack">
      <div className="bayes-actions">
        <span className="bayes-label">Camera detects</span>
        {CLS.map((c, d) => (
          <Button
            key={c}
            variant="primary"
            onClick={() => detect(d)}
            onMouseEnter={() => setHoverCol(d)}
            onMouseLeave={() => setHoverCol(null)}
            onFocus={() => setHoverCol(d)}
            onBlur={() => setHoverCol(null)}
            title={`Add a frame where the camera reports ${c}: multiply by the ${c} column (${table.map((r) => f2(r[d])).join(', ')}) and renormalise`}
          >
            {c}
          </Button>
        ))}
        <Button size="sm" onClick={undo} disabled={!seq.length}>
          ◀ Undo
        </Button>
        <Button size="sm" onClick={reset} disabled={!seq.length}>
          ↺ Back to the prior
        </Button>
        <Button size="sm" onClick={() => setup(() => (loadExam(), runSeq([1, 0])))} title="2025 Q28: prior 0.3 / 0.5 / 0.2, detections B then A">
          Exam preset (B, then A)
        </Button>
      </div>
      {timeline}
      <div className="bayes-legend-line small">
        {NAMES.map((nm, i) => (
          <span key={nm}>
            <span className="bayes-dot" style={{ background: COL[i] }} /> {nm} ({CLS[i]})
          </span>
        ))}
        <span className="muted">Click a bar to inspect that step.</span>
      </div>
      <div className="bayes-cls-dec-head">
        <span className="bayes-label">
          Expected grasp success {at === last ? 'now' : `at step ${at}`}: <Rich text="$\sum_x P(\text{success} \mid g, x)\,P(x)$" inline />
        </span>
      </div>
      {expBars}
      <Rich
        className="small muted"
        text={`Each bar is split by fruit: piece = $P(\\text{success} \\mid g, x)\\,P(x)$. **Use ${GRIPPERS[dec.best]}** (${f3(dec.expected[dec.best])} against ${f3(dec.expected[1 - dec.best])}). With the gripper chosen, the same sum is $P(\\text{success})$ by total probability; $P(\\text{success} \\mid N) = 0$ (nothing to grasp).`}
      />
    </div>
  );

  // ---------------------------------------------------------------- right column
  const right = (
    <>
      <Panel title="Sensor model: P(detected | true)">
        <div className="bayes-table-wrap">
          <table className="bayes-table bayes-cls-conf">
            <thead>
              <tr>
                <th className="is-left">true ↓ / detected →</th>
                {CLS.map((c, d) => (
                  <th key={c} className={shownCol === d ? 'is-col' : undefined}>
                    {c}
                  </th>
                ))}
                <th>Σ</th>
              </tr>
            </thead>
            <tbody>
              {table.map((row, x) => (
                <tr key={x}>
                  <td className="is-left">
                    <span className="bayes-chip" style={{ background: COL[x] }} aria-hidden="true" />
                    {NAMES[x]}
                  </td>
                  {row.map((v, d) => (
                    <td key={d} className={shownCol === d ? 'is-col' : undefined}>
                      <NumCell className="bayes-num-in" value={v} label={`P(detect ${CLS[d]} | ${NAMES[x]})`} onCommit={(val) => setTable((t) => setLikAt(t, x, d, val))} />
                    </td>
                  ))}
                  <td className="muted">{f2(row.reduce((a, b) => a + b, 0))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Rich
          className="note"
          text={
            shownCol !== null
              ? `A **${CLS[shownCol]}** detection uses the highlighted **column**: $P(z{=}${CLS[shownCol]} \\mid x) = (${table.map((r) => f2(r[shownCol])).join(', ')})$ for $x$ = A, B, N. Not the ${CLS[shownCol]} row: a row is what the camera reports for one true fruit.`
              : 'Rows: the true fruit (each row sums to 1). Columns: what the camera reports. Editing a cell rescales the rest of its row.'
          }
        />
      </Panel>

      <Panel title={upd ? `Update ${at}: the camera reports ${CLS[seq[at - 1]]}` : 'The belief before any frame'} live>
        {upd ? (
          <HandTable
            zTex={`z{=}${CLS[seq[at - 1]]}`}
            priorTex={at === 1 ? 'P(x)' : at === 2 ? 'P(x \\mid z_1)' : `P(x \\mid z_{1:${at - 1}})`}
            postTex={at === 1 ? 'P(x \\mid z_1)' : `P(x \\mid z_{1:${at}})`}
            rows={NAMES.map((nm, i) => ({ key: nm, label: `${CLS[i]} (${nm})`, chip: COL[i], prior: upd.prior[i], lik: upd.likelihood[i], product: upd.product[i], post: upd.posterior[i] }))}
          />
        ) : (
          <>
            <p className="small muted bayes-tight">The paper’s belief after earlier frames. Press A, B or N to add a frame (or load the exam preset).</p>
            {NAMES.map((nm, i) => (
              <div key={nm} className="bayes-row bayes-cls-prior">
                <span className="bayes-cls-prior-name">
                  <span className="bayes-chip" style={{ background: COL[i] }} aria-hidden="true" />
                  {`P(${CLS[i]})`}
                </span>
                <input type="range" min={0} max={1} step={0.01} value={prior[i]} aria-label={`Prior P(${CLS[i]})`} onChange={(e) => setPrior((p) => setPriorAt(p, i, Number(e.target.value)))} />
                <span className="mono small">{f2(prior[i])}</span>
              </div>
            ))}
          </>
        )}
        {upd && (
          <Rich
            className="small"
            text={`$P(z{=}${CLS[seq[at - 1]]}) = ${upd.product.map((v) => f4(v)).join(' + ')} = ${f4(upd.evidence)}$, so $\\eta = ${f2(1 / upd.evidence)}$. ${at < last ? '' : 'This posterior is the prior for the next frame.'}`}
          />
        )}
      </Panel>

      {seq.length > 1 && (
        <Panel title="Every update, in order">
          <div className="bayes-cls-all">
            {tables.slice(-6).map((t, j) => {
              const k = tables.length - Math.min(6, tables.length) + j + 1;
              return (
                <HandTable
                  key={k}
                  compact
                  caption={`Frame ${k}: detects ${CLS[seq[k - 1]]}  (Σ product = P(z) = ${f4(t.evidence)})`}
                  zTex={`z{=}${CLS[seq[k - 1]]}`}
                  rows={NAMES.map((nm, i) => ({ key: nm, label: CLS[i], chip: COL[i], prior: t.prior[i], lik: t.likelihood[i], product: t.product[i], post: t.posterior[i] }))}
                />
              );
            })}
          </div>
        </Panel>
      )}

      <Panel title="Grasp success rates">
        <div className="bayes-table-wrap">
          <table className="bayes-table">
            <thead>
              <tr>
                <th className="is-left">gripper</th>
                <th>Apple</th>
                <th>Banana</th>
                <th>None</th>
              </tr>
            </thead>
            <tbody>
              {GRIPPERS.map((g, gi) => (
                <tr key={g}>
                  <td className="is-left">{g}</td>
                  {[0, 1].map((i) => (
                    <td key={i}>
                      <NumCell
                        className="bayes-num-in"
                        value={success[gi][i]}
                        step={0.05}
                        label={`P(success | ${g}, ${NAMES[i]})`}
                        onCommit={(v) => setSuccess((s) => s.map((row, a) => row.map((x, b) => (a === gi && b === i ? v : x))))}
                      />
                    </td>
                  ))}
                  <td className="muted">0</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Rich className="note" text="$P(\text{success} \mid g, x)$: the paper’s 95 % / 70 % (suction) and 60 % / 90 % (pinch). With no fruit there is nothing to grasp." />
      </Panel>

      <Panel title="Predict, then check" className="bayes-predicts">
        <PredictReveal
          id="bayes-classifier-cancel"
          question="2025 Q28: belief 0.3 / 0.5 / 0.2, then the camera reports **B**, then **A**. After both frames, which fruit is more likely?"
          options={['Apple, clearly (above 0.7)', 'Banana, clearly (above 0.8)', 'Nearly a tie: banana 0.503, apple 0.483', 'No fruit (N): the two frames disagree']}
          answer={2}
          explain="After B the belief is 0.0723 / 0.9036 / 0.0241. The A frame multiplies by the **A column** (0.6, 0.05, 0.05): banana is hit by 0.05 and apple by 0.6, a ratio of 12. That nearly undoes the B frame (ratio 0.75 / 0.1 = 7.5 the other way): 0.4832 / 0.5034 / 0.0134. One detection the camera rarely makes by mistake is strong evidence. “No fruit” stays tiny: an empty slot rarely gives either an A or a B detection (0.05 each)."
          tryIt="load the exam preset and watch the two bars."
          onApply={() => setup(() => (loadExam(), runSeq([1, 0])))}
        />
        <PredictReveal
          id="bayes-classifier-gripper"
          question="After B then A, banana is (just) the most likely fruit. Which gripper should the robot use?"
          options={['Pinch: banana is the most likely fruit', 'Suction: higher expected success', 'Either: the fruit is a 50/50 guess']}
          answer={1}
          explain="Decide on the **expected outcome**, not the most likely state: suction $= 0.95(0.483) + 0.70(0.503) = 0.811$, pinch $= 0.60(0.483) + 0.90(0.503) = 0.743$. Suction is excellent on apples and still decent on bananas, while pinch is poor on apples. The same sum with the chosen gripper is part (c), $P(\text{success}) = 0.811$."
          tryIt="look at the two expected-success bars after the exam sequence."
          onApply={() => setup(() => (loadExam(), runSeq([1, 0])))}
        />
        <PredictReveal
          id="bayes-classifier-flip"
          question="A third frame reports **B** again (B, A, B). Which gripper now?"
          options={['Still suction', 'Pinch', 'It no longer matters']}
          answer={1}
          explain="The B column pushes the belief to 0.113 / 0.885 / 0.002. Now pinch expects $0.60(0.113) + 0.90(0.885) = 0.865$ against suction’s $0.95(0.113) + 0.70(0.885) = 0.727$. The best action is a function of the belief, so it can flip with one more frame: the robot should keep looking while frames are cheap."
          tryIt="after the exam sequence press B once more and watch the best-gripper label under the bars."
          onApply={() => setup(() => (loadExam(), runSeq([1, 0, 1])))}
        />
        <PredictReveal
          id="bayes-classifier-order"
          question="The same two frames arrive in the **other order**: A first, then B. How does the final belief compare?"
          options={['Banana wins clearly: the last frame counts most', 'Apple wins: the first frame counts most', 'Exactly the same as B then A']}
          answer={2}
          explain="With no prediction step between frames (the fruit does not change), the belief after both is $\eta\,P(A \mid x)P(B \mid x)P(x)$: a product, and products do not care about order. Only the intermediate beliefs differ. With motion between readings the order would matter."
          tryIt="press Back to the prior, then A, then B, and compare the last bar with the exam preset’s."
          onApply={() => setup(() => (loadExam(), runSeq([0, 1])))}
        />
        <PredictReveal
          id="bayes-classifier-column"
          question="The camera reports **B**. Which three numbers multiply the belief (A, B, N)?"
          options={['0.05, 0.75, 0.2: the B row', '0.1, 0.75, 0.05: the B column', '0.75 for B and 0 for the others']}
          answer={1}
          explain="The likelihood is $P(z{=}B \mid x)$ for each possible true fruit $x$: the B **column** (true A: 0.1, true B: 0.75, true N: 0.05). The B row is $P(\text{each reading} \mid \text{true } B)$, the wrong conditional. Reading a row instead of a column is the commonest slip in this question."
          tryIt="hover the B button and look at the highlighted column."
          onApply={() =>
            setup(() => {
              loadExam();
              setHoverCol(null);
              runSeq([1], 0);
            })
          }
        />
      </Panel>
    </>
  );

  return (
    <BayesLayout
      left={left}
      right={right}
      below={
        <More label="The method (2025 Q28 worked solution)">
          <Rich
            text={`1. The fruit does not change between frames, so there is **no prediction step**: each frame is one correction, $P(x \\mid z) = \\eta\\,P(z \\mid x)P(x)$ with $\\eta = 1/\\sum_x P(z \\mid x)P(x)$.
2. The likelihood is the **column** of the confusion table for the detected class; readings are conditionally independent given the fruit.
3. Each posterior is the next prior (the timeline above).
4. Decision: compute $\\sum_x P(\\text{success} \\mid g, x)P(x)$ for each gripper and use the larger. Part (c) is the same sum for the gripper used (total probability, with $P(\\text{success} \\mid N) = 0$).`}
          />
        </More>
      }
    />
  );
}
