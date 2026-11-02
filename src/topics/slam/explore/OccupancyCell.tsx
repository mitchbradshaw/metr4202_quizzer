// One occupancy cell, reading by reading (2023 Q31, review deck slides 9-13, 2025 Q22). Set the sensor's
// true-positive and true-negative rates, feed the cell OCCUPIED / FREE readings and watch two pictures of the
// same Bayes filter: the probability (a step plot that saturates near 0 and 1) and the log-odds, where every
// reading is an arrow of FIXED length ln LR whatever the current belief. The second picture is why one strong
// OCC outweighs one weak FREE, why order does not matter, and why a prior of 0 or 1 never moves.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { ExploreItem } from '../../../engine/types';
import { logOdds, occupancyTable, readingLR, readingStep, readingsToCancel, type BinaryReading, type BinarySensor, type OccRow } from '../../../core/slam';
import { Button, Callout, More, Readout, Readouts, Segmented, Slider } from '../../../ui/kit';
import { PredictReveal } from '../../../ui/PredictReveal';
import { Rich } from '../../../ui/Rich';
import { Dot, HLine, Line, Plot } from '../../../plot/Plot';
import { useRaf, useWidth } from '../../../anim/hooks';
import { completeChallenge, useProgress } from '../../../app/store';
import { BELIEF_C, FREE_C, OCC_C, ZChip, colorOfZ, fx, revealEl, sgn, tx } from './slamCommon';

export const meta: Omit<ExploreItem, 'component'> = {
  id: 'occupancy',
  title: 'One occupancy cell, reading by reading',
  summary:
    'Set the sensor’s true-positive and true-negative rates, then feed one grid cell OCCUPIED and FREE readings. The probability saturates near 0 and 1, but in log-odds every reading adds the same fixed step $\\ln \\text{LR}$, so you can see why one strong reading outweighs one weak one, why the order does not matter, and why a prior of 0 or 1 is stuck forever.',
  notice:
    'Each reading moves the log-odds by a fixed $\\ln\\text{LR}$ whatever the cell already believes: the long orange OCC arrow beats the short blue FREE arrow whenever false positives are rarer than misses ($\\text{TN} > \\text{TP}$).',
  challenge: { id: 'slam-occ-flip', title: 'Find a sensor for which OCCUPIED then FREE ends below 0.5' },
  minutes: 8,
};

const CHALLENGE_ID = 'slam-occ-flip';
const MAX_READINGS = 24;

type PresetId = 'review' | 'q31' | 'sym' | 'misses';
const PRESETS: Record<PresetId, { tp: number; tn: number; label: string; title: string }> = {
  review: { tp: 0.85, tn: 0.99, label: 'Review deck', title: 'Review deck slides 9-13: TP 0.85, TN 0.99' },
  q31: { tp: 0.7, tn: 0.95, label: '2023 Q31', title: '2023 Q31: TP 0.70, TN 0.95' },
  sym: { tp: 0.9, tn: 0.9, label: 'Symmetric', title: 'TP = TN = 0.90: both readings equally strong' },
  misses: { tp: 0.95, tn: 0.8, label: 'False alarms', title: 'TP 0.95, TN 0.80: rarely misses an obstacle, often fires on free space' },
};

const ZTEX: Record<BinaryReading, string> = { occ: '\\text{occ}', free: '\\text{free}' };

export default function OccupancyCell() {
  const [tp, setTp] = useState(0.7);
  const [tn, setTn] = useState(0.95);
  const [p0, setP0] = useState(0.5);
  const [readings, setReadings] = useState<BinaryReading[]>([]);
  const [truth, setTruth] = useState<BinaryReading>('occ');
  const [playing, setPlaying] = useState(false);
  const queue = useRef<BinaryReading[]>([]);
  const pace = useRef(0.55);
  const acc = useRef(0);
  const leftRef = useRef<HTMLDivElement>(null);
  const [wfWrap, wfW] = useWidth<HTMLDivElement>(620);
  const challengeDone = !!useProgress().challenges[CHALLENGE_ID];

  const s: BinarySensor = useMemo(() => ({ tp, tn }), [tp, tn]);
  const rows = useMemo(() => occupancyTable(p0, readings, s), [p0, readings, s]);
  const n = rows.length;
  const pNow = n ? rows[n - 1].post : p0;
  const lNow = n ? rows[n - 1].l : logOdds(p0);
  const lrOcc = readingLR('occ', s);
  const lrFree = readingLR('free', s);
  const dOcc = readingStep('occ', s);
  const dFree = readingStep('free', s);
  const preset = (Object.keys(PRESETS) as PresetId[]).find((k) => Math.abs(PRESETS[k].tp - tp) < 1e-9 && Math.abs(PRESETS[k].tn - tn) < 1e-9) ?? 'custom';

  // Queued readings ("Show me" and "Sample") appear one at a time, so the arrows can be watched growing.
  useRaf((dt) => {
    acc.current += dt;
    if (acc.current < pace.current) return;
    acc.current = 0;
    const z = queue.current.shift();
    if (z) setReadings((r) => (r.length < MAX_READINGS ? [...r, z] : r));
    if (!queue.current.length) setPlaying(false);
  }, playing);

  const play = (zs: BinaryReading[], o: { clear?: boolean; pace?: number } = {}) => {
    queue.current = zs.slice();
    pace.current = o.pace ?? 0.55;
    acc.current = pace.current * 0.45;
    if (o.clear) setReadings([]);
    setPlaying(zs.length > 0);
  };
  const stopQueue = () => {
    queue.current = [];
    setPlaying(false);
  };
  const add = (z: BinaryReading) => {
    stopQueue();
    setReadings((r) => (r.length < MAX_READINGS ? [...r, z] : r));
  };
  const setup = (o: { tp?: number; tn?: number; p0?: number; zs: BinaryReading[]; pace?: number }) => {
    if (o.tp !== undefined) setTp(o.tp);
    if (o.tn !== undefined) setTn(o.tn);
    if (o.p0 !== undefined) setP0(o.p0);
    play(o.zs, { clear: true, pace: o.pace });
    revealEl(leftRef.current, '.slam-occ-wf');
  };
  const sample = (k: number) => {
    const zs: BinaryReading[] = [];
    for (let i = 0; i < k; i++) {
      const u = Math.random();
      zs.push(truth === 'occ' ? (u < tp ? 'occ' : 'free') : u < tn ? 'free' : 'occ');
    }
    play(zs, { clear: true, pace: 0.22 });
  };

  // Challenge: OCC then FREE from the uninformative prior ends below 0.5.
  const challengeMet = p0 === 0.5 && readings.length === 2 && readings[0] === 'occ' && readings[1] === 'free' && pNow < 0.5 - 1e-9;
  useEffect(() => {
    if (challengeMet && !challengeDone) completeChallenge(CHALLENGE_ID);
  }, [challengeMet, challengeDone]);

  const stuck = p0 <= 0 || p0 >= 1;
  const cancelFree = readingsToCancel('occ', 'free', s);
  const cancelOcc = readingsToCancel('free', 'occ', s);
  const full = readings.length >= MAX_READINGS;

  // ---------------------------------------------------------------- left: the two pictures
  const left = (
    <div className="slam-left slam-panel" ref={leftRef}>
      <div className="slam-bar">
        <Button variant="default" className="slam-occ-add is-occ" onClick={() => add('occ')} disabled={full} title="The sensor reports OCCUPIED">
          + OCCUPIED
        </Button>
        <Button variant="default" className="slam-occ-add is-free" onClick={() => add('free')} disabled={full} title="The sensor reports FREE">
          + FREE
        </Button>
        <Button size="sm" onClick={() => (stopQueue(), setReadings((r) => r.slice(0, -1)))} disabled={!readings.length} title="Remove the last reading">
          ↶ Undo
        </Button>
        <Button size="sm" onClick={() => (stopQueue(), setReadings([]))} disabled={!readings.length} title="Back to the prior">
          Clear
        </Button>
        <span className="slam-occ-seq" aria-label="Readings so far">
          {readings.length === 0 ? (
            <span className="muted small">no readings yet: press OCCUPIED or FREE</span>
          ) : (
            readings.map((z, i) => <ZChip key={i} z={z} small />)
          )}
        </span>
      </div>
      <div ref={wfWrap} className="slam-occ-wf">
        <Waterfall rows={rows} p0={p0} width={wfW} />
      </div>
      <ProbPlot rows={rows} p0={p0} />
      <div className="slam-legend small">
        <span>
          <i className="slam-sw" style={{ background: OCC_C }} /> OCC reading (step +ln LR)
        </span>
        <span>
          <i className="slam-sw" style={{ background: FREE_C }} /> FREE reading (usually a negative step)
        </span>
        <span>
          <i className="slam-sw" style={{ background: BELIEF_C }} /> belief p(m)
        </span>
      </div>
    </div>
  );

  // ---------------------------------------------------------------- right: sensor, prior, table, predictions
  const right = (
    <div className="slam-right">
      <section className="slam-panel">
        <h4>The sensor</h4>
        <Segmented
          size="sm"
          label="Sensor preset"
          value={preset}
          onChange={(k) => {
            if (k === 'custom') return;
            setTp(PRESETS[k as PresetId].tp);
            setTn(PRESETS[k as PresetId].tn);
          }}
          options={(Object.keys(PRESETS) as PresetId[]).map((k) => ({ value: k, label: PRESETS[k].label, title: PRESETS[k].title }))}
        />
        <Slider label="true positive" tex="\text{TP}" tip="p(z = occ | m): the chance an occupied cell reads OCCUPIED. 1 − TP is the miss (false-negative) rate." value={tp} min={0.5} max={0.995} step={0.005} onChange={setTp} format={(v) => v.toFixed(3)} />
        <Slider label="true negative" tex="\text{TN}" tip="p(z = free | ¬m): the chance a free cell reads FREE. 1 − TN is the false-positive rate." value={tn} min={0.5} max={0.995} step={0.005} onChange={setTn} format={(v) => v.toFixed(3)} />
        <SensorTable tp={tp} tn={tn} last={n ? rows[n - 1].z : null} />
        <div className="slam-occ-lr">
          <div className="slam-occ-lrbox is-occ">
            <div>
              <ZChip z="occ" /> <Rich inline text={'$\\text{LR} = \\text{TP} / (1-\\text{TN})$'} />
            </div>
            <div className="mono">
              = {tp.toFixed(3)} / {(1 - tn).toFixed(3)} = <strong>{lrFmt(lrOcc)}</strong>
            </div>
            <div className="mono small">step in log-odds: {sgn(dOcc)}</div>
          </div>
          <div className="slam-occ-lrbox is-free">
            <div>
              <ZChip z="free" /> <Rich inline text={'$\\text{LR} = (1-\\text{TP}) / \\text{TN}$'} />
            </div>
            <div className="mono">
              = {(1 - tp).toFixed(3)} / {tn.toFixed(3)} = <strong>{lrFmt(lrFree)}</strong>
            </div>
            <div className="mono small">step in log-odds: {sgn(dFree)}</div>
          </div>
        </div>
        <Rich
          className="note"
          text={
            Math.abs(dOcc + dFree) < 0.005
              ? 'The two arrows have the same length: one FREE exactly cancels one OCC.'
              : dOcc + dFree > 0
                ? `OCC is the stronger reading: one OCC takes **${cancelFree} FREE** readings to undo (${Math.abs(dOcc).toFixed(2)} / ${Math.abs(dFree).toFixed(2)} = ${(Math.abs(dOcc) / Math.abs(dFree)).toFixed(2)}).`
                : `FREE is the stronger reading: one FREE takes **${cancelOcc} OCC** readings to undo (${Math.abs(dFree).toFixed(2)} / ${Math.abs(dOcc).toFixed(2)} = ${(Math.abs(dFree) / Math.abs(dOcc)).toFixed(2)}).`
          }
        />
      </section>

      <section className="slam-panel">
        <h4>The prior</h4>
        <Slider label="prior" tex="p(m)" tip="Occupancy before any reading. 0.5 = no information (log-odds 0). 0 or 1 = certainty: log-odds ∓∞, and no reading can ever move it." value={p0} min={0} max={1} step={0.01} onChange={(v) => setP0(Math.round(v * 100) / 100)} format={(v) => v.toFixed(2)} />
        <div className="slam-bar">
          {[0, 0.2, 0.5, 0.8, 1].map((v) => (
            <Button key={v} size="sm" variant={p0 === v ? 'primary' : 'default'} onClick={() => setP0(v)}>
              {v}
            </Button>
          ))}
        </div>
        {stuck ? (
          <Callout kind="trap" title={`A prior of ${p0} is certainty`}>
            <Rich text={`$l_0 = \\ln\\frac{${p0}}{${1 - p0}} = ${p0 === 0 ? '-' : '+'}\\infty$. Adding any finite $\\ln\\text{LR}$ leaves $${p0 === 0 ? '-' : '+'}\\infty$, and in Bayes form every numerator carries the factor $p(${p0 === 0 ? 'm' : '\\neg m'}) = 0$. This cell can never change, however many readings contradict it (2025 Q22). Use 0.5.`} />
          </Callout>
        ) : (
          <Rich className="note" text={p0 === 0.5 ? 'No information: $p(m) = 0.5$ is log-odds $l_0 = 0$, so it adds no bias (2023 Q31a).' : `$l_0 = \\ln\\frac{${p0}}{${(1 - p0).toFixed(2)}} = ${tx(logOdds(p0), 3)}$: every reading starts from this offset.`} />
        )}
        <Readouts min={120}>
          <Readout tex="p(m \mid z_{1:t})" value={pNow} sig={4} tip="Occupancy after the readings so far" tone="m3" />
          <Readout tex="l_t" text={sgn(lNow, 3)} tip="Log-odds after the readings so far: ln(p / (1 − p))" />
          <Readout label="readings" text={`${n}${full ? ' (max)' : ''}`} tip="Readings taken so far" />
        </Readouts>
      </section>

      <section className="slam-panel">
        <h4>Simulate a real cell</h4>
        <div className="slam-bar">
          <span className="small muted">The cell is truly</span>
          <Segmented size="sm" label="True state of the cell" value={truth} onChange={setTruth} options={[{ value: 'occ', label: 'occupied' }, { value: 'free', label: 'free' }]} />
          <Button size="sm" onClick={() => sample(12)}>
            Sample 12 readings
          </Button>
        </div>
        <Rich className="note" text="Readings are drawn from the sensor table, so some are wrong. Each wrong one is one arrow the wrong way; the log-odds still drifts towards the truth, faster when the right reading is the strong one." />
      </section>

      <section className="slam-panel">
        <h4>The working, reading by reading</h4>
        <HandTable rows={rows} p0={p0} />
        {n > 0 && <Working row={rows[n - 1]} p0={p0} />}
      </section>

      <section className="slam-panel slam-predicts">
        <h4>Predict, then check</h4>
        <PredictReveal
          id="slam-occ-2023"
          question="2023 Q31 sensor (TP 0.70, TN 0.95), prior 0.5. The cell reads OCCUPIED, then FREE. Where does $p(m)$ end up?"
          options={['Back at 0.5: one reading each way cancels', 'About 0.82: still probably occupied', 'Just above 0.5', 'Below 0.5: the latest reading wins']}
          answer={1}
          explain="OCC is 14× evidence ($\text{LR} = 0.70/0.05$: the sensor almost never fires on a free cell), FREE only about 3.2× ($0.95/0.30$: it misses 30 % of obstacles). In log-odds: $0 + 2.64 - 1.15 = 1.49$, so $p = 0.8155$. One weak FREE cannot cancel one strong OCC (2023 Q31d)."
          tryIt="load the 2023 sensor and play OCC, FREE."
          onApply={() => setup({ tp: 0.7, tn: 0.95, p0: 0.5, zs: ['occ', 'free'] })}
        />
        <PredictReveal
          id="slam-occ-cancel"
          question="Same sensor. After one OCCUPIED, how many FREE readings in a row bring $p(m)$ back below 0.5?"
          options={['1', '2', '3', '14']}
          answer={2}
          explain="Each FREE removes 1.15 and the OCC added 2.64: after two FREE readings $l = 0.33$ ($p = 0.58$), after three $l = -0.82$ ($p = 0.31$). $2.64 / 1.15 = 2.29$, so it takes **3**."
          tryIt="play OCC then three FREE readings and watch the arrows cross the 0.5 line."
          onApply={() => setup({ tp: 0.7, tn: 0.95, p0: 0.5, zs: ['occ', 'free', 'free', 'free'] })}
        />
        <PredictReveal
          id="slam-occ-order"
          question="Swap the order: FREE first, then OCCUPIED (same sensor). Compared with OCC-then-FREE, the final $p(m)$ is…"
          options={['Lower: the last reading counts most', 'Higher: the first reading counts most', 'Exactly the same, 0.8155']}
          answer={2}
          explain="Each reading adds its own fixed $\ln\text{LR}$, and addition does not care about order: $0 - 1.15 + 2.64 = 1.49$ either way. The probability path differs (it dips to 0.24 first), the end point does not. That is what “each cell is updated independently by Bayes’ rule” buys you."
          tryIt="play FREE, OCC and compare the end point with 0.8155."
          onApply={() => setup({ tp: 0.7, tn: 0.95, p0: 0.5, zs: ['free', 'occ'] })}
        />
        <PredictReveal
          id="slam-occ-prior0"
          question="Start the cell at $p(m) = 0$ (“known free”) and send ten OCCUPIED readings from the review-deck sensor (each 85× evidence). What happens?"
          options={['It climbs to almost 1', 'It climbs a little, to about 0.5', 'It stays at exactly 0']}
          answer={2}
          explain="$l_0 = \ln(0/1) = -\infty$, and $-\infty$ plus any finite number is still $-\infty$. In Bayes form every numerator has the factor $p(m) = 0$. The cell can never change, so a wrong prior becomes a permanent error (2025 Q22). That is why cells start at 0.5."
          tryIt="set the prior to 0 and play ten OCC readings."
          onApply={() => setup({ tp: 0.85, tn: 0.99, p0: 0, zs: Array<BinaryReading>(10).fill('occ'), pace: 0.25 })}
        />
        <PredictReveal
          id="slam-occ-sym"
          question="Make the sensor symmetric, $\text{TP} = \text{TN} = 0.90$. OCCUPIED then FREE ends at…"
          options={['Exactly 0.5', 'About 0.9', 'About 0.82, as for the 2023 sensor']}
          answer={0}
          explain="Now both readings have $\text{LR} = 0.9/0.1 = 9$, so the arrows are $+2.20$ and $-2.20$ and cancel exactly. It is the **asymmetry** of the 2023 sensor (false positives 5 %, misses 30 %) that keeps OCC-then-FREE high."
          tryIt="set TP = TN = 0.90 and play OCC, FREE."
          onApply={() => setup({ tp: 0.9, tn: 0.9, p0: 0.5, zs: ['occ', 'free'] })}
        />
      </section>

      <section className="slam-panel">
        <h4>Challenge: make OCC-then-FREE end low</h4>
        <Rich
          className="small"
          text={`Change only the sensor (prior 0.5), then take exactly OCCUPIED, FREE. Now: ${readings.length === 2 && readings[0] === 'occ' && readings[1] === 'free' && p0 === 0.5 ? `**${pNow.toFixed(4)}**` : 'take OCC, FREE from prior 0.5'}.`}
        />
        {(challengeDone || challengeMet) && (
          <Callout kind="ok" title="Challenge complete">
            <Rich text="OCC-then-FREE ends below 0.5 exactly when $\text{TP} > \text{TN}$: then misses ($1-\text{TP}$) are rarer than false alarms ($1-\text{TN}$), so a FREE reading is the stronger evidence. Strength is the likelihood ratio, not the reading’s order." />
          </Callout>
        )}
      </section>
    </div>
  );

  return (
    <div className="slam-sim">
      <div className="slam-layout">
        {left}
        {right}
      </div>
      <More label="Conventions (the course’s)">
        <Rich
          text={`- $m$ = “the cell is occupied”. The sensor table’s rows are the true state ($m$, $\\neg m$), its columns the reading, and each row sums to 1, so the false-positive rate is $1 - \\text{TN}$.
- Bayes’ rule per reading, the previous posterior being the next prior: $$p(m \\mid z_{1:t}) = \\frac{p(z_t \\mid m)\\,p(m \\mid z_{1:t-1})}{p(z_t \\mid m)\\,p(m \\mid z_{1:t-1}) + p(z_t \\mid \\neg m)\\,p(\\neg m \\mid z_{1:t-1})}$$
- The same update in log-odds (review deck): $$l_t = l_{t-1} + \\ln\\frac{p(m \\mid z_t)}{1 - p(m \\mid z_t)} - l_0, \\qquad p(m \\mid z_{1:t}) = 1 - \\frac{1}{1 + e^{l_t}}$$ where $p(m \\mid z_t)$ is the inverse sensor model computed from the prior $p_0$ (0.9884 / 0.1316 on the review slides). Its log-odds is $\\ln\\text{LR} + l_0$, so the step is just $\\ln\\text{LR} = \\ln\\frac{p(z_t \\mid m)}{p(z_t \\mid \\neg m)}$.
- Exact arithmetic gives 0.92795 for the review deck’s OCC-then-FREE; the slide’s 0.9281 comes from carrying the rounded 0.9884. Both are accepted in exam mode.`}
        />
      </More>
    </div>
  );
}

// ------------------------------------------------------------------ pieces

/** 14.0× or 0.316 (= 1/3.17×): a ratio below 1 is evidence for FREE, read as "1 over". */
function lrFmt(x: number): string {
  if (!Number.isFinite(x)) return '∞';
  if (x >= 1) return `${x >= 100 ? x.toFixed(0) : x.toFixed(2)}×`;
  return `${x.toFixed(3)} (1/${(1 / x).toFixed(2)})`;
}

function SensorTable({ tp, tn, last }: { tp: number; tn: number; last: BinaryReading | null }) {
  const col = (z: BinaryReading) => (last === z ? 'is-col' : undefined);
  return (
    <div className="slam-table-wrap">
      <table className="slam-table slam-occ-sensor" aria-label="Sensor model p(z | state)">
        <thead>
          <tr>
            <th>true state</th>
            <th className={col('occ')}>
              <Rich inline text="$z = \text{occ}$" />
            </th>
            <th className={col('free')}>
              <Rich inline text="$z = \text{free}$" />
            </th>
            <th>Σ</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th>
              <Rich inline text="$m$ (occupied)" />
            </th>
            <td className={col('occ')} title="True positive: p(occ | m)">
              {tp.toFixed(3)} <span className="slam-tag">TP</span>
            </td>
            <td className={col('free')} title="Miss (false negative): p(free | m) = 1 − TP">
              {(1 - tp).toFixed(3)} <span className="slam-tag">miss</span>
            </td>
            <td>1</td>
          </tr>
          <tr>
            <th>
              <Rich inline text="$\neg m$ (free)" />
            </th>
            <td className={col('occ')} title="False positive: p(occ | ¬m) = 1 − TN">
              {(1 - tn).toFixed(3)} <span className="slam-tag">false +</span>
            </td>
            <td className={col('free')} title="True negative: p(free | ¬m)">
              {tn.toFixed(3)} <span className="slam-tag">TN</span>
            </td>
            <td>1</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/** Horizontal waterfall in log-odds: the prior, then one fixed-length arrow per reading. */
function Waterfall({ rows, p0, width }: { rows: OccRow[]; p0: number; width: number }) {
  const l0 = logOdds(p0);
  const inf = Number.isFinite(l0) ? 0 : l0 > 0 ? 1 : -1;
  const ls = [l0, ...rows.map((r) => r.l)].filter(Number.isFinite);
  const span = Math.max(5.5, ...ls.map((v) => Math.abs(v)), ...rows.map((r) => Math.abs(r.dl) * 0.6));
  const L = Math.ceil(span + 0.7);
  const n = rows.length;
  const padL = 64;
  const padR = 14;
  const top = 30;
  // At least 6 rows tall, so the figure does not jump as the first readings arrive.
  const slots = Math.max(6, n + 1);
  const rowH = Math.max(9, Math.min(24, 216 / slots));
  const axisY = top + slots * rowH + 8;
  const H = axisY + 46;
  const iw = Math.max(120, width - padL - padR);
  const sx = (l: number) => padL + ((Math.max(-L, Math.min(L, l)) + L) / (2 * L)) * iw;
  const step = L <= 8 ? 1 : L <= 16 ? 2 : L <= 40 ? 5 : 10;
  const ticks: number[] = [];
  for (let v = -Math.floor(L / step) * step; v <= L + 1e-9; v += step) ticks.push(v);
  // Probability labels under the log-odds axis, spread so they never overlap.
  const pCands = [0.5, 0.9, 0.1, 0.99, 0.01, 0.999, 0.001, 0.9999, 0.0001, 0.99999, 0.00001];
  const pLabels: { p: number; x: number }[] = [];
  for (const p of pCands) {
    const l = logOdds(p);
    if (Math.abs(l) > L) continue;
    const x = sx(l);
    if (x < padL + 14 || x > padL + iw - 14) continue;
    if (pLabels.every((q) => Math.abs(q.x - x) > 40)) pLabels.push({ p, x });
  }
  const yRow = (t: number) => top + t * rowH;
  const lEnd = n ? rows[n - 1].l : l0;
  const xEnd = Number.isFinite(lEnd) ? sx(lEnd) : lEnd > 0 ? padL + iw : padL;
  const pEnd = n ? rows[n - 1].post : p0;
  const bars: ReactNode[] = [];
  rows.forEach((r, k) => {
    const t = k + 1;
    const yc = yRow(t) + rowH / 2;
    const bh = Math.max(5, rowH * 0.58);
    const color = colorOfZ(r.z);
    const label = sgn(r.dl);
    bars.push(
      <text key={`lab${t}`} className="slam-wf-rowlab" x={padL - 8} y={yc + 3.5} textAnchor="end">
        {`z${t} ${r.z === 'occ' ? 'OCC' : 'FREE'}`}
      </text>
    );
    if (inf) {
      const x = inf < 0 ? padL + 6 : padL + iw - 6;
      bars.push(
        <text key={`inf${t}`} className="slam-wf-num" x={x} y={yc + 3.5} textAnchor={inf < 0 ? 'start' : 'end'} fill={color}>
          {`${label} → still ${inf < 0 ? '−∞' : '+∞'}`}
        </text>
      );
      return;
    }
    const xa = sx(r.lPrev);
    const xb = sx(r.l);
    const dir = xb >= xa ? 1 : -1;
    const head = Math.min(7, Math.abs(xb - xa));
    const shaftEnd = xb - dir * head;
    const lo = Math.min(xa, shaftEnd);
    const w = Math.abs(shaftEnd - xa);
    const wide = Math.abs(xb - xa) > 46;
    bars.push(
      <g key={`bar${t}-${r.z}`} className="slam-wf-bar" style={{ transformOrigin: `${xa}px ${yc}px` }}>
        <rect x={lo} y={yc - bh / 2} width={w} height={bh} rx={2} fill={color} opacity={0.88} />
        <path d={`M${shaftEnd} ${yc - bh / 2 - 2.5}L${xb} ${yc}L${shaftEnd} ${yc + bh / 2 + 2.5}Z`} fill={color} />
        {wide ? (
          <text className="slam-wf-num is-in" x={(xa + shaftEnd) / 2} y={yc + 3.5} textAnchor="middle">
            {label}
          </text>
        ) : (
          <text className="slam-wf-num" x={xb + dir * 5} y={yc + 3.5} textAnchor={dir > 0 ? 'start' : 'end'} fill={color}>
            {label}
          </text>
        )}
      </g>
    );
  });
  return (
    <svg className="slam-svg slam-wf" width={width} height={H} viewBox={`0 0 ${width} ${H}`} role="img" aria-label={`Log-odds after ${n} readings: ${sgn(lEnd, 2)}, probability ${pEnd.toFixed(4)}`}>
      <rect x={padL} y={top - 4} width={iw / 2} height={axisY - top + 4} className="slam-wf-half is-free" />
      <rect x={padL + iw / 2} y={top - 4} width={iw / 2} height={axisY - top + 4} className="slam-wf-half is-occ" />
      <text className="slam-wf-side" x={padL + 6} y={top - 10}>
        ← probably free
      </text>
      <text className="slam-wf-side" x={padL + iw - 6} y={top - 10} textAnchor="end">
        probably occupied →
      </text>
      {ticks.map((v) => (
        <line key={`g${v}`} className={v === 0 ? 'slam-wf-zero' : 'slam-wf-grid'} x1={sx(v)} x2={sx(v)} y1={top - 4} y2={axisY} />
      ))}
      {/* prior row */}
      <text className="slam-wf-rowlab" x={padL - 8} y={yRow(0) + rowH / 2 + 3.5} textAnchor="end">
        prior
      </text>
      {inf ? (
        <g>
          <rect x={inf < 0 ? padL : padL + iw - 5} y={top - 4} width={5} height={axisY - top + 4} className="slam-wf-wall" />
          <text className="slam-wf-num" x={inf < 0 ? padL + 9 : padL + iw - 9} y={yRow(0) + rowH / 2 + 3.5} textAnchor={inf < 0 ? 'start' : 'end'} fill="var(--bad)">
            {`l₀ = ${inf < 0 ? '−∞' : '+∞'} (p = ${p0}): pinned`}
          </text>
        </g>
      ) : (
        <g>
          <path d={`M${sx(l0)} ${yRow(0) + 2}l6 ${rowH / 2 - 2}l-6 ${rowH / 2 - 2}l-6 ${-(rowH / 2 - 2)}Z`} fill="var(--text-2)" />
          <text className="slam-wf-num" x={sx(l0) + (l0 > L * 0.4 ? -10 : 10)} y={yRow(0) + rowH / 2 + 3.5} textAnchor={l0 > L * 0.4 ? 'end' : 'start'} fill="var(--text-2)">
            {`l₀ = ${sgn(l0)}`}
          </text>
        </g>
      )}
      {bars}
      {/* current value */}
      <g className="slam-wf-now" style={{ transform: `translateX(${xEnd}px)` }}>
        <line x1={0} x2={0} y1={top - 4} y2={axisY} className="slam-wf-nowline" />
        <circle cx={0} cy={axisY} r={5.5} fill={BELIEF_C} stroke="var(--surface)" strokeWidth={2} />
      </g>
      <text className="slam-wf-head" x={padL + iw / 2} y={13} textAnchor="middle">
        {`log-odds l = ${sgn(lEnd, 2)}   ⇔   p(m) = ${pEnd.toFixed(4)}`}
      </text>
      {/* axes */}
      <line x1={padL} x2={padL + iw} y1={axisY} y2={axisY} className="slam-wf-axis" />
      {ticks.map((v) => (
        <text key={`t${v}`} className="slam-wf-tick" x={sx(v)} y={axisY + 14} textAnchor="middle">
          {v === 0 ? '0' : v > 0 ? `+${v}` : `−${-v}`}
        </text>
      ))}
      <text className="slam-wf-axlab" x={4} y={axisY + 14}>
        log-odds
      </text>
      {pLabels.map((q) => (
        <text key={`p${q.p}`} className="slam-wf-ptick" x={q.x} y={axisY + 31} textAnchor="middle">
          {String(q.p)}
        </text>
      ))}
      <text className="slam-wf-axlab is-p" x={4} y={axisY + 31}>
        p(m)
      </text>
      {n === 0 && !inf && (
        <text className="slam-wf-side" x={padL + iw / 2} y={top + rowH * 2.6} textAnchor="middle">
          each reading adds one arrow here
        </text>
      )}
    </svg>
  );
}

/** p(m | z_1:t) against the reading number, as steps (the jump happens at the reading). */
function ProbPlot({ rows, p0 }: { rows: OccRow[]; p0: number }) {
  const n = rows.length;
  const probs = [p0, ...rows.map((r) => r.post)];
  const pts: [number, number][] = [[0, p0]];
  rows.forEach((r, k) => {
    pts.push([k + 1, probs[k]]);
    pts.push([k + 1, r.post]);
  });
  const xmax = Math.max(4, n);
  const stepT = xmax <= 12 ? 1 : xmax <= 24 ? 2 : 4;
  const ticks: number[] = [];
  for (let t = 0; t <= xmax; t += stepT) ticks.push(t);
  return (
    <Plot x={{ min: 0, max: xmax + 0.3, label: 'reading number t', ticks }} y={{ min: 0, max: 1, label: 'p(m | z₁:ₜ)', ticks: [0, 0.25, 0.5, 0.75, 1] }} height={190} ariaLabel="Probability of occupancy after each reading">
      <HLine y={0.5} label="0.5: no information" />
      <Line points={pts} color={BELIEF_C} width={2.5} />
      {probs.map((p, t) => (
        <Dot key={t} x={t} y={p} r={t === 0 ? 4 : 4.5} color={t === 0 ? 'var(--text-2)' : colorOfZ(rows[t - 1].z)} />
      ))}
    </Plot>
  );
}

function HandTable({ rows, p0 }: { rows: OccRow[]; p0: number }) {
  if (!rows.length)
    return <Rich className="small muted" text={`Start: $p(m) = ${p0}$. Take a reading to fill the table.`} />;
  const shown = rows.slice(-8);
  return (
    <div className="slam-table-wrap">
      <table className="slam-table slam-occ-hand">
        <thead>
          <tr>
            <th>t</th>
            <th>z</th>
            <th title="p(z_t | m), from the sensor table's m row">p(z|m)</th>
            <th title="p(z_t | ¬m), from the sensor table's ¬m row">p(z|¬m)</th>
            <th title="p(m) before this reading (the previous posterior)">before</th>
            <th title="p(m) after this reading">after</th>
            <th title="ln of the likelihood ratio: the step in log-odds">ln LR</th>
            <th title="Log-odds after this reading">l</th>
          </tr>
        </thead>
        <tbody>
          {rows.length > shown.length && (
            <tr>
              <td colSpan={8} className="muted small">
                … {rows.length - shown.length} earlier readings
              </td>
            </tr>
          )}
          {shown.map((r) => (
            <tr key={r.t} className={r.t === rows.length ? 'is-last' : undefined}>
              <td>{r.t}</td>
              <td>
                <ZChip z={r.z} small />
              </td>
              <td>{r.pzm.toFixed(3)}</td>
              <td>{r.pznm.toFixed(3)}</td>
              <td>{fx(r.prior)}</td>
              <td className="is-key">{fx(r.post)}</td>
              <td style={{ color: colorOfZ(r.z) }}>{sgn(r.dl, 3)}</td>
              <td>{sgn(r.l, 3)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The latest reading substituted into both forms. */
function Working({ row: r, p0 }: { row: OccRow; p0: number }) {
  const pm = tx(r.prior, 4);
  const pn = tx(1 - r.prior, 4);
  const bayes = `$$p(m \\mid z_{1:${r.t}}) = \\frac{${r.pzm.toFixed(3)} \\times ${pm}}{${r.pzm.toFixed(3)} \\times ${pm} + ${r.pznm.toFixed(3)} \\times ${pn}} = ${tx(r.post, 4)}$$`;
  const finite = Number.isFinite(r.lPrev);
  const lo = finite
    ? `$$l_{${r.t}} = ${tx(r.lPrev, 3)} + \\ln\\frac{${r.pzm.toFixed(3)}}{${r.pznm.toFixed(3)}} = ${tx(r.lPrev, 3)} ${r.dl >= 0 ? '+' : '-'} ${Math.abs(r.dl).toFixed(3)} = ${tx(r.l, 3)}$$`
    : `$$l_{${r.t}} = ${tx(r.lPrev, 0)} + (${tx(r.dl, 3)}) = ${tx(r.l, 0)}$$`;
  const l0 = logOdds(p0);
  const ism = Number.isFinite(l0)
    ? `Course form: the inverse sensor model from the prior ${p0} is $p(m \\mid z_{${r.t}} = ${ZTEX[r.z]}) = ${tx(r.ism, 4)}$, and $\\ln(${tx(r.ism, 4)} / ${tx(1 - r.ism, 4)}) - l_0 = ${tx(logOdds(r.ism), 3)} - (${tx(l0, 3)}) = ${tx(logOdds(r.ism) - l0, 3)}$: the same step.`
    : '';
  return (
    <div className="slam-occ-working">
      <Rich text={`Reading ${r.t} (${r.z === 'occ' ? 'OCC' : 'FREE'}) in Bayes form, the previous posterior ${tx(r.prior, 4)} as the prior:${bayes}and in log-odds, adding $\\ln\\text{LR}$:${lo}${ism}`} />
    </div>
  );
}

