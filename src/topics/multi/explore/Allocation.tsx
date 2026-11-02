// Task allocation with explicit coordination (an auction over a lossy network) vs implicit coordination (each
// robot infers who will take what from what it can see). The mission is simulated once per setting
// (core/multi_alloc.ts) and replayed frame by frame; both strategies are also run on the same layout for the
// side-by-side table, and a team-size sweep shows the message load growing.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { ExploreItem } from '../../../engine/types';
import { Button, Callout, More, Readout, Readouts, Segmented, Slider } from '../../../ui/kit';
import { StepControls, useStepper } from '../../../ui/stepper';
import { PredictReveal } from '../../../ui/PredictReveal';
import { Rich } from '../../../ui/Rich';
import { Line, Plot } from '../../../plot/Plot';
import { completeChallenge, useProgress } from '../../../app/store';
import { ARENA_H, ARENA_W, meanMetrics, simulateAllocation, type AllocEvent, type AllocTrace, type CoordMode } from '../../../core/multi_alloc';
import { Panel, f, revealLeft, useDebounced } from './multiCommon';

export const meta: Omit<ExploreItem, 'component'> = {
  id: 'allocation',
  title: 'Task allocation: explicit vs implicit coordination',
  summary:
    'Robots share out inspection sites. **Explicit**: they run an auction over the radio (call for bids, bid your travel distance, award, “done”), and every message can be lost. **Implicit**: no messages; each robot watches its teammates and assumes the nearest robot takes each site. Count tasks, duplicated trips, distance and messages.',
  notice:
    'Explicit coordination is clean while the network works and degrades as messages drop (stale claims, duplicated trips); implicit coordination ignores the network but pays for its wrong guesses, and the message load of explicit grows fast with team size.',
  challenge: { id: 'multi-alloc-break', title: 'Find a dropout at which the explicit team wastes more distance than the implicit one (same layout)' },
  minutes: 10,
};

const CHALLENGE_ID = 'multi-alloc-break';
const SC = 50; // px per metre
const PADX = 14;
const PADY = 12;
const X = (x: number) => PADX + x * SC;
const Y = (y: number) => PADY + y * SC;

const EV_ICON: Record<AllocEvent['kind'], string> = {
  auction: '📣',
  award: '🤝',
  'award-lost': '⚠',
  'claimed-reply': '↩',
  done: '✓',
  'done-lost': '⚠',
  duplicate: '✗',
  stale: '⌛',
  yield: '↪',
  switch: '↪',
};

interface Params {
  mode: CoordMode;
  nRobots: number;
  nTasks: number;
  dropout: number;
  senseRange: number;
  seed: number;
}

function Arena({ tr, i, mode, senseRange, showMsgs }: { tr: AllocTrace; i: number; mode: CoordMode; senseRange: number; showMsgs: boolean }) {
  const N = tr.params.nRobots;
  const t = i * tr.dt;
  const pos = (r: number) => [tr.pos[(i * N + r) * 2], tr.pos[(i * N + r) * 2 + 1]];
  const parts: ReactNode[] = [];
  // grid
  for (let x = 0; x <= ARENA_W; x++) parts.push(<line key={`gx${x}`} x1={X(x)} x2={X(x)} y1={Y(0)} y2={Y(ARENA_H)} className="multi-gridline" />);
  for (let y = 0; y <= ARENA_H; y++) parts.push(<line key={`gy${y}`} x1={X(0)} x2={X(ARENA_W)} y1={Y(y)} y2={Y(y)} className="multi-gridline" />);
  // sensing range (implicit)
  if (mode === 'implicit')
    for (let r = 0; r < N; r++) {
      const [x, y] = pos(r);
      parts.push(<circle key={`sr${r}`} cx={X(x)} cy={Y(y)} r={senseRange * SC} className="multi-sense" />);
    }
  // targets: who is heading where; two robots on one task = conflict
  const byTask = new Map<number, number[]>();
  for (let r = 0; r < N; r++) {
    const k = tr.target[i * N + r];
    if (k >= 0) byTask.set(k, [...(byTask.get(k) ?? []), r]);
  }
  for (let r = 0; r < N; r++) {
    const k = tr.target[i * N + r];
    if (k < 0) continue;
    const [x, y] = pos(r);
    const clash = (byTask.get(k)?.length ?? 0) > 1;
    parts.push(<line key={`tl${r}`} x1={X(x)} y1={Y(y)} x2={X(tr.tasks[k].x)} y2={Y(tr.tasks[k].y)} className={clash ? 'multi-target is-clash' : 'multi-target'} />);
  }
  // messages in the last 0.25 s
  if (showMsgs && mode === 'explicit') {
    let shown = 0;
    for (let m = tr.msgs.length - 1; m >= 0 && shown < 160; m--) {
      const msg = tr.msgs[m];
      if (msg.t > t + 1e-9) continue;
      if (msg.t < t - 0.25) break;
      const [x1, y1] = pos(msg.from);
      const [x2, y2] = pos(msg.to);
      parts.push(<line key={`m${m}`} x1={X(x1)} y1={Y(y1)} x2={X(x2)} y2={Y(y2)} className={msg.delivered ? 'multi-msg' : 'multi-msg is-lost'} />);
      if (!msg.delivered) {
        const mx = X((x1 + x2) / 2);
        const my = Y((y1 + y2) / 2);
        parts.push(<path key={`mx${m}`} d={`M${mx - 5} ${my - 5}L${mx + 5} ${my + 5}M${mx + 5} ${my - 5}L${mx - 5} ${my + 5}`} className="multi-msg-x" />);
      }
      shown++;
    }
  }
  // tasks
  tr.tasks.forEach((tk, k) => {
    const done = tr.doneAt[k] <= t + 1e-9;
    let serving = false;
    for (let r = 0; r < N; r++) if (tr.serving[i * N + r] && tr.target[i * N + r] === k) serving = true;
    parts.push(
      <g key={`t${k}`}>
        <rect x={X(tk.x) - 8} y={Y(tk.y) - 8} width={16} height={16} rx={3} className={done ? 'multi-task is-done' : serving ? 'multi-task is-serving' : 'multi-task'} />
        {done && <path d={`M${X(tk.x) - 4} ${Y(tk.y)}l3 3l6 -7`} className="multi-tick" />}
        <text x={X(tk.x)} y={Y(tk.y) + 21} textAnchor="middle" className="multi-tlabel">{`T${k + 1}`}</text>
      </g>
    );
  });
  // robots
  for (let r = 0; r < N; r++) {
    const [x, y] = pos(r);
    parts.push(
      <g key={`r${r}`} transform={`translate(${X(x).toFixed(1)} ${Y(y).toFixed(1)})`}>
        <circle r={10} className={tr.serving[i * N + r] ? 'multi-robot is-serving' : tr.target[i * N + r] < 0 ? 'multi-robot is-idle' : 'multi-robot'} />
        <text y={4} textAnchor="middle" className="multi-rlabel">
          {r + 1}
        </text>
      </g>
    );
  }
  return (
    <svg className="multi-arena" viewBox={`0 0 ${PADX * 2 + ARENA_W * SC} ${PADY * 2 + ARENA_H * SC}`} role="img" aria-label={`Arena ${ARENA_W} by ${ARENA_H} m with ${N} robots and ${tr.tasks.length} tasks at t = ${t.toFixed(1)} s`}>
      <rect x={X(0)} y={Y(0)} width={ARENA_W * SC} height={ARENA_H * SC} className="multi-floor" />
      {parts}
    </svg>
  );
}

function Compare({ ex, im, mode }: { ex: AllocTrace; im: AllocTrace; mode: CoordMode }) {
  const rows: { label: string; tip: string; get: (t: AllocTrace) => string; better: 'low' | 'high' | null }[] = [
    { label: 'tasks done', tip: 'Tasks finished by the end of the mission', get: (t) => `${t.metrics.done} / ${t.tasks.length}`, better: null },
    { label: 'time to finish', tip: 'When the last task was finished', get: (t) => `${f(t.metrics.makespan)} s`, better: 'low' },
    { label: 'distance driven', tip: 'Total distance of all robots', get: (t) => `${f(t.metrics.totalDist)} m`, better: 'low' },
    { label: 'wasted distance', tip: 'Distance that did not end in a task this robot completed', get: (t) => `${f(t.metrics.wastedDist)} m`, better: 'low' },
    { label: 'duplicated trips', tip: 'Trips to a task someone else already did or was doing', get: (t) => String(t.metrics.duplicates), better: 'low' },
    { label: 'messages sent', tip: 'Every message to one teammate counts once', get: (t) => String(t.metrics.messages), better: 'low' },
    { label: 'messages lost', tip: 'Messages that never arrived', get: (t) => String(t.metrics.lost), better: 'low' },
    { label: 'idle robot-time', tip: 'Robot-seconds spent waiting while tasks were still unfinished', get: (t) => `${f(t.metrics.idle)} s`, better: 'low' },
  ];
  return (
    <div className="multi-table-wrap">
      <table className="multi-table">
        <thead>
          <tr>
            <th style={{ textAlign: 'left' }}>whole mission</th>
            <th className={mode === 'explicit' ? 'is-on' : undefined}>explicit</th>
            <th className={mode === 'implicit' ? 'is-on' : undefined}>implicit</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label}>
              <td style={{ textAlign: 'left' }} title={r.tip}>
                {r.label}
              </td>
              <td className={mode === 'explicit' ? 'is-on' : undefined}>{r.get(ex)}</td>
              <td className={mode === 'implicit' ? 'is-on' : undefined}>{r.get(im)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function AllocationSim() {
  const challengeDone = !!useProgress().challenges?.[CHALLENGE_ID];
  const [p, setP] = useState<Params>({ mode: 'explicit', nRobots: 6, nTasks: 12, dropout: 0, senseRange: 3, seed: 1 });
  const [showMsgs, setShowMsgs] = useState(true);
  const set = (o: Partial<Params>) => setP((q) => ({ ...q, ...o }));
  const leftRef = useRef<HTMLDivElement>(null);

  const ex = useMemo(() => simulateAllocation({ ...p, mode: 'explicit' }), [p.nRobots, p.nTasks, p.dropout, p.seed]); // eslint-disable-line react-hooks/exhaustive-deps
  const im = useMemo(() => simulateAllocation({ ...p, mode: 'implicit' }), [p.nRobots, p.nTasks, p.senseRange, p.seed]); // eslint-disable-line react-hooks/exhaustive-deps
  const tr = p.mode === 'explicit' ? ex : im;
  const st = useStepper(tr.frames - 1, { speed: 20 });
  useEffect(() => {
    st.reset();
    st.play();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tr]);
  const i = Math.min(st.i, tr.frames - 1);
  const t = i * tr.dt;

  // Team-size sweep (debounced: ~30 short simulations).
  const sweepKey = useDebounced(`${p.dropout}|${p.senseRange}|${p.nTasks}|${p.seed}`, 200);
  const sweep = useMemo(() => {
    const [dropout, senseRange, nTasks, seed] = sweepKey.split('|').map(Number);
    const seeds = [seed, seed + 1, seed + 2];
    const Ns = [2, 3, 4, 6, 8, 10, 12];
    return Ns.map((N) => {
      const e = meanMetrics({ nRobots: N, nTasks, mode: 'explicit', dropout, senseRange }, seeds);
      const m = meanMetrics({ nRobots: N, nTasks, mode: 'implicit', dropout, senseRange }, seeds);
      return { N, msgs: e.messages, exDup: e.duplicates, imDup: m.duplicates, exWaste: e.wastedDist, imWaste: m.wastedDist };
    });
  }, [sweepKey]);
  const sweepMax = Math.max(10, ...sweep.map((s) => s.msgs));
  const dupMax = Math.max(2, ...sweep.map((s) => Math.max(s.exDup, s.imDup)));

  // Live counters at this frame.
  const N = tr.params.nRobots;
  let done = 0;
  for (let k = 0; k < tr.tasks.length; k++) if (tr.doneAt[k] <= t + 1e-9) done++;
  let idleNow = 0;
  for (let r = 0; r < N; r++) if (tr.target[i * N + r] < 0 && !tr.serving[i * N + r]) idleNow++;
  const recent = useMemo(() => {
    const out: AllocEvent[] = [];
    for (let k = tr.events.length - 1; k >= 0 && out.length < 7; k--) {
      const e = tr.events[k];
      if (e.t > t + 1e-9) continue;
      if (e.kind === 'auction' && tr.params.nRobots > 4) continue;
      out.push(e);
    }
    return out;
  }, [tr, t]);

  // Challenge: lossy explicit wastes more distance than implicit on this layout.
  const challengeMet = ex.metrics.wastedDist > im.metrics.wastedDist + 0.5 && p.dropout > 0;
  useEffect(() => {
    if (challengeMet && !challengeDone) completeChallenge(CHALLENGE_ID);
  }, [challengeMet, challengeDone]);

  const setup = (o: Partial<Params>) => {
    set(o);
    revealLeft(leftRef.current);
  };

  // Facts quoted by the predictions (default layout, 6 robots, 12 tasks).
  const F = useMemo(() => {
    const base = { nRobots: 6, nTasks: 12, senseRange: 3, seed: 1 };
    const e0 = simulateAllocation({ ...base, mode: 'explicit', dropout: 0 }).metrics;
    const e5 = simulateAllocation({ ...base, mode: 'explicit', dropout: 0.5 }).metrics;
    const i3 = simulateAllocation({ ...base, mode: 'implicit', dropout: 0.5 }).metrics;
    const e12 = simulateAllocation({ ...base, nRobots: 12, mode: 'explicit', dropout: 0.2 }).metrics;
    const e6 = simulateAllocation({ ...base, mode: 'explicit', dropout: 0.2 }).metrics;
    return { e0, e5, i3, e12, e6 };
  }, []);

  const left = (
    <div className="multi-left multi-panel" ref={leftRef}>
      <div className="multi-bar">
        <Segmented
          label="Coordination"
          value={p.mode}
          onChange={(mode) => set({ mode })}
          options={[
            { value: 'explicit', label: 'Explicit (auction)', title: 'Robots communicate and negotiate: call for bids, bid, award, done' },
            { value: 'implicit', label: 'Implicit (observe)', title: 'No messages: each robot infers what teammates will do from what it sees' },
          ]}
        />
        <Button size="sm" variant="ghost" onClick={() => set({ seed: p.seed + 1 })} title="Another random layout of robots and tasks">
          ↻ New layout
        </Button>
      </div>
      <Arena tr={tr} i={i} mode={p.mode} senseRange={p.senseRange} showMsgs={showMsgs} />
      <StepControls st={st} label="tick" speeds={[10, 20, 50, 100]} extra={<span className="mono small">t = {f(t)} s</span>} />
      <div className="multi-legend small">
        <span>
          <i className="multi-sw multi-sw-robot" /> robot (grey: idle)
        </span>
        <span>
          <i className="multi-sw multi-sw-task" /> task
        </span>
        <span>
          <i className="multi-sw multi-sw-done" /> done
        </span>
        <span>
          <i className="multi-sw multi-sw-line" /> heading to
        </span>
        <span>
          <i className="multi-sw multi-sw-clash" /> two robots, one task
        </span>
        {p.mode === 'explicit' ? (
          <>
            <span>
              <i className="multi-sw multi-sw-msg" /> message
            </span>
            <span>
              <i className="multi-sw multi-sw-lost" /> lost message
            </span>
          </>
        ) : (
          <span>
            <i className="multi-sw multi-sw-sense" /> what each robot can see
          </span>
        )}
      </div>
    </div>
  );

  const right = (
    <div className="multi-right">
      <Panel title="Team and network">
        <Slider label="robots" tip="Team size N" value={p.nRobots} min={2} max={12} step={1} onChange={(v) => set({ nRobots: Math.round(v) })} format={(v) => String(Math.round(v))} />
        <Slider label="tasks" tip="Number of sites to visit" value={p.nTasks} min={4} max={20} step={1} onChange={(v) => set({ nTasks: Math.round(v) })} format={(v) => String(Math.round(v))} />
        <Slider
          label="message loss"
          tip="Probability that any single message is lost (explicit only: implicit sends none)"
          value={p.dropout}
          min={0}
          max={0.8}
          step={0.05}
          onChange={(v) => set({ dropout: v })}
          format={(v) => `${Math.round(v * 100)} %`}
        />
        <Slider label="sensing range" tip="How far a robot can see teammates and tasks (implicit only)" value={p.senseRange} min={1.5} max={12} step={0.5} unit="m" onChange={(v) => set({ senseRange: v })} sig={2} />
        <label className="multi-check small">
          <input type="checkbox" checked={showMsgs} onChange={(e) => setShowMsgs(e.target.checked)} /> draw messages as they are sent
        </label>
      </Panel>

      <Panel title={`Now (t = ${f(t)} s)`}>
        <Readouts min={118}>
          <Readout label="Tasks done" text={`${done} / ${tr.tasks.length}`} tip="Finished so far" tone="ok" />
          <Readout label="Duplicated trips" text={String(tr.cumDup[i])} tip="Trips that ended at, or were abandoned for, a task another robot did" tone={tr.cumDup[i] > 0 ? 'bad' : undefined} />
          <Readout label="Distance" text={`${f(tr.cumDist[i])} m`} tip="Distance driven by all robots so far" />
          <Readout label="Wasted" text={`${f(tr.cumWaste[i])} m`} tip="Distance that did not lead to a task the robot completed" />
          <Readout label="Messages" text={`${tr.cumMsgs[i]}`} tip="Messages sent so far (each teammate counts once)" tone="m1" />
          <Readout label="Lost" text={`${tr.cumLost[i]}`} tip="Messages that never arrived" tone={tr.cumLost[i] ? 'bad' : undefined} />
          <Readout label="Idle robots" text={`${idleNow}`} tip="Robots with no task right now" />
        </Readouts>
        <ul className="multi-log" aria-live="polite">
          {recent.length === 0 && <li className="muted">Events will appear here.</li>}
          {recent.map((e, k) => (
            <li key={`${e.t}-${k}`} className={`is-${e.kind}`}>
              <span className="mono">{f(e.t)} s</span> {EV_ICON[e.kind]} {e.text}
            </li>
          ))}
        </ul>
      </Panel>

      <Panel title="Same layout, both strategies">
        <Compare ex={ex} im={im} mode={p.mode} />
        <Rich
          className="small"
          text={`Explicit at ${Math.round(p.dropout * 100)} % message loss; implicit seeing ${p.senseRange} m. ${ex.metrics.duplicates === 0 && p.dropout === 0 ? 'With a perfect network the auction never sends two robots to one task.' : ''}`}
        />
      </Panel>

      <Panel title="As the team grows">
        <Plot x={{ min: 2, max: 12, label: 'robots N' }} y={{ min: 0, max: sweepMax * 1.08, label: 'messages' }} height={170} ariaLabel="Messages per mission against team size">
          <Line points={sweep.map((s) => [s.N, s.msgs] as [number, number])} color="var(--m1)" width={2.5} />
          <Line points={sweep.map((s) => [s.N, 0] as [number, number])} color="var(--m3)" width={2.5} dash />
        </Plot>
        <Plot x={{ min: 2, max: 12, label: 'robots N' }} y={{ min: 0, max: dupMax * 1.1, label: 'duplicated trips' }} height={150} ariaLabel="Duplicated trips per mission against team size">
          <Line points={sweep.map((s) => [s.N, s.exDup] as [number, number])} color="var(--m1)" width={2.5} />
          <Line points={sweep.map((s) => [s.N, s.imDup] as [number, number])} color="var(--m3)" width={2.5} dash />
        </Plot>
        <Rich
          className="small"
          text={`Blue: explicit at ${Math.round(p.dropout * 100)} % loss; green dashed: implicit (no messages at all), mean of 3 layouts with ${p.nTasks} tasks. Every call for bids goes to $N - 1$ teammates and more robots means more calls, so the load grows faster than the team: about ${Math.round(sweep[3].msgs)} messages for 6 robots, ${Math.round(sweep[6].msgs)} for 12.`}
        />
      </Panel>

      <Panel title="Predict, then check" className="multi-predicts">
        <PredictReveal
          id="multi-alloc-p0"
          question="Explicit auction, **no** message loss, 6 robots, 12 tasks. How many duplicated trips (two robots going for the same task)?"
          options={['None', '1 to 3', 'More than 3']}
          answer={0}
          explain={`Every call, bid, award and “done” arrives, so every robot’s table of claims is identical and no task is ever held by two robots: ${F.e0.duplicates} duplicated trips. Each task also goes to the nearest idle robot that bid. The price is talk: ${F.e0.messages} messages for 12 tasks.`}
          tryIt="explicit, 0 % loss: watch the blue message lines at each call and the target lines (never red)."
          onApply={() => setup({ mode: 'explicit', dropout: 0, nRobots: 6, nTasks: 12, seed: 1 })}
        />
        <PredictReveal
          id="multi-alloc-drop"
          question="Same team, but now **50 %** of messages are lost. What happens to the explicit team?"
          options={['Nothing: the auction still assigns every task once', 'Duplicated trips and stale claims appear, and it sends more messages', 'It stops: no task gets done']}
          answer={1}
          explain={`A robot that misses an award still thinks the task is open and may take it too; a winner that misses its own award never goes, so its claim goes stale until it times out; missed “done” messages send robots to finished tasks. On this layout: ${F.e5.duplicates} duplicated trips, ${f(F.e5.wastedDist)} m wasted, and ${F.e5.messages} messages (${F.e5.lost} lost) instead of ${F.e0.messages}. The tasks still get done: the protocol recovers, slowly. Explicit coordination depends on the network.`}
          tryIt="set the message loss to 50 % and look for red ✕ lines and red target lines."
          onApply={() => setup({ mode: 'explicit', dropout: 0.5, nRobots: 6, nTasks: 12, seed: 1 })}
        />
        <PredictReveal
          id="multi-alloc-implicit"
          question="Keep the 50 % loss and switch to **implicit** coordination (no messages; each robot sees 3 m around it). What do you get?"
          options={['0 messages and no duplicated trips', '0 messages, but some duplicated trips from wrong guesses', 'The same as explicit at 50 % loss']}
          answer={1}
          explain={`No messages, so the network does not matter at all. But each robot only guesses what teammates it cannot see will do: two robots out of each other’s view both head for the same task, and a robot only learns a task is finished when it gets within 3 m. Here: ${F.i3.duplicates} duplicated trips and ${f(F.i3.wastedDist)} m wasted. Widen the sensing range and the guesses improve: implicit coordination is only as good as what the robots can observe.`}
          tryIt="switch to implicit and drag the sensing range from 1.5 m up to 12 m."
          onApply={() => setup({ mode: 'implicit', dropout: 0.5, senseRange: 3, nRobots: 6, nTasks: 12, seed: 1 })}
        />
        <PredictReveal
          id="multi-alloc-size"
          question="Explicit at 20 % loss. Double the team from 6 to 12 robots (same 12 tasks). The number of messages per mission…"
          options={['stays about the same', 'about doubles', 'more than doubles']}
          answer={2}
          explain={`Each call for bids now goes to 11 teammates instead of 5, up to 11 bids come back, the award goes to 11, and with more robots idle at once there are more calls. ${F.e6.messages} → ${F.e12.messages} messages (×${(F.e12.messages / Math.max(1, F.e6.messages)).toFixed(1)}). Message load growing faster than the team is why explicit coordination scales poorly, and why bandwidth and latency limits bite (2023 Q30).`}
          tryIt="set the loss to 20 % and move the robots slider from 6 to 12; compare with the plot."
          onApply={() => setup({ mode: 'explicit', dropout: 0.2, nRobots: 12, nTasks: 12, seed: 1 })}
        />
      </Panel>

      <Panel title="Challenge: when does talking stop paying?">
        <Rich
          className="small"
          text={`On one layout, find a message loss at which the explicit team wastes **more distance** than the implicit team. Now: explicit ${f(ex.metrics.wastedDist)} m vs implicit ${f(im.metrics.wastedDist)} m wasted. (Implicit robots that see further guess better.)`}
        />
        {(challengeDone || challengeMet) && (
          <Callout kind="ok" title="Challenge complete">
            <Rich text="Explicit wins on a good network (no conflicts, near-optimal allocation); implicit wins when communication is unreliable or absent, e.g. underground or in a disaster zone. That trade-off is the 3-mark comparison question (2024 Q27, 2025 Q27)." />
          </Callout>
        )}
      </Panel>
    </div>
  );

  return (
    <div className="multi-sim">
      <div className="multi-layout">
        {left}
        {right}
      </div>
      <More label="How the two strategies work here">
        <Rich
          text={`**Explicit (a simple auction).** An idle robot calls for bids on the nearest task it believes is open (one message to each teammate). Idle teammates bid their travel distance; a teammate that knows the task is already claimed or done says so. The caller awards the task to the lowest bid it heard and broadcasts the award; the finisher broadcasts “done”. Every message is lost independently with the chosen probability. A claim that is not followed by “done” in time is treated as stale and re-auctioned.

**Implicit (no messages).** Every robot follows the same convention: *the robot nearest to a task takes it*. It applies that rule to the teammates and tasks it can see (within the sensing range), assumes everyone else does the same, and heads for whatever the rule gives itself. It only learns that a task is finished when it sees it.

**Counting.** A duplicated trip is a trip that ends at (or is abandoned for) a task someone else already did or was doing. Wasted distance is everything driven that did not end in a task that robot completed. Robots move at 1 m/s and spend 1 s at each task.`}
        />
      </More>
    </div>
  );
}
