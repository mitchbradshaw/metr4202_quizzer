// A* by hand on a road map: the exam's long answer (2024 Q29; review deck slide 17) as a stepper.
// Watch the Open / Closed tables fill in exactly as the worked solutions write them, compare A* with
// Dijkstra, greedy and BFS on the same question, drive it yourself (pick each pop, type each f), and
// overestimate one heuristic to see A* return a worse route.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ExploreItem } from '../../../engine/types';
import { costToGo, neighboursOf, type Algo } from '../../../core/graph';
import { evaluate } from '../../../engine/expr';
import { freshSeed } from '../../../engine/rng';
import { completeChallenge, useProgress } from '../../../app/store';
import { Badge, Button, Callout, More, Segmented, Select, Slider, Toggle } from '../../../ui/kit';
import { PredictReveal } from '../../../ui/PredictReveal';
import { Rich } from '../../../ui/Rich';
import { StepControls, useStepper } from '../../../ui/stepper';
import { australiaMap, brisbaneMap, randomMap, type MapDef, type MapKey } from './astarMaps';
import { RoadGraph, type GraphView } from './astarGraph';
import { ClosedTable, OpenTable } from './astarTables';
import {
  closedAt,
  expectedEntries,
  judgeEntry,
  judgePop,
  num,
  openAt,
  pathSum,
  popLine,
  runExam,
  typedQuantity,
  updateLine,
  type PopVerdict,
} from './astarTable';
import '../astar.css';

export const ASTAR_CHALLENGE = 'plan-astar-drive';

export const meta: Omit<ExploreItem, 'component'> = {
  id: 'astar',
  title: 'A* by hand on a road map',
  summary:
    'The exam’s A* question as a stepper on the 2024 Brisbane map, the review deck’s Australia or random maps: watch the Open and Closed tables fill in, then drive it yourself (pick each pop, type each $f$) and break the heuristic to see why admissibility matters.',
  notice:
    'A* always pops the lowest $f = g + h$, stops only when the goal is **popped** (not when it first enters Open), and re-parents an Open town when a cheaper $g$ turns up.',
  challenge: { id: ASTAR_CHALLENGE, title: 'Drive A* on a random map with every pop and every f right first time' },
  minutes: 12,
};

const ALGOS: Algo[] = ['astar', 'dijkstra', 'greedy', 'bfs'];
const ALGO_SHORT: Record<Algo, string> = { astar: 'A*', dijkstra: 'Dijkstra', greedy: 'Greedy', bfs: 'BFS', dfs: 'DFS' };
const ALGO_RULE: Record<Algo, string> = { astar: '$f = g + h$', dijkstra: '$g$ only', greedy: '$h$ only', bfs: 'arrival order', dfs: 'newest first' };
const NO_EDITS: Record<string, number> = {};

interface Drive {
  phase: 'pick' | 'type' | 'checked';
  verdict: (PopVerdict & { k: number }) | null;
  flash: { node: string; ok: boolean } | null;
  typed: Record<string, string>;
  results: Record<string, { ok: boolean; message: string }> | null;
  pickTried: number[];
  valsTried: number[];
  /** [right first time, attempted] */
  pickScore: [number, number];
  valScore: [number, number];
  revealed: number;
}

const FRESH: Drive = { phase: 'pick', verdict: null, flash: null, typed: {}, results: null, pickTried: [], valsTried: [], pickScore: [0, 0], valScore: [0, 0], revealed: 0 };

function makeMap(key: MapKey, seed: number): MapDef {
  return key === 'brisbane' ? brisbaneMap() : key === 'australia' ? australiaMap() : randomMap(seed);
}

export default function RoadMapAStar() {
  const progress = useProgress();
  const rootRef = useRef<HTMLDivElement>(null);
  const [mapKey, setMapKey] = useState<MapKey>('brisbane');
  const [seed, setSeed] = useState(4202);
  const map = useMemo(() => makeMap(mapKey, seed), [mapKey, seed]);
  const mapId = `${map.key}:${map.seed ?? ''}`;

  // Start / goal and heuristic edits belong to one map (and goal); switching maps falls back to the defaults.
  const [endsRaw, setEndsRaw] = useState({ id: '', start: '', goal: '' });
  const ends = endsRaw.id === mapId ? endsRaw : { id: mapId, start: map.start, goal: map.goal };
  const { start, goal } = ends;
  const [algo, setAlgo] = useState<Algo>('astar');
  const hId = `${mapId}:${goal}`;
  const [hEditRaw, setHEditRaw] = useState<{ id: string; edits: Record<string, number> }>({ id: '', edits: {} });
  const edits = hEditRaw.id === hId ? hEditRaw.edits : NO_EDITS;

  const [mode, setMode] = useState<'watch' | 'drive'>('watch');
  const [clickRole, setClickRole] = useState<'start' | 'goal'>('start');
  const [showH, setShowH] = useState(true);
  const [showValues, setShowValues] = useState(true);
  const [typing, setTyping] = useState(true);
  const [drive, setDrive] = useState<Drive>(FRESH);

  const ids = useMemo(() => map.graph.nodes.map((n) => n.id), [map]);
  const table = useMemo(() => map.hFor(goal), [map, goal]);
  const hRec = useMemo(() => {
    const o: Record<string, number> = {};
    for (const id of ids) o[id] = edits[id] ?? (table ? table[id] ?? 0 : 0);
    return o;
  }, [ids, table, edits]);
  const hOf = useCallback((n: string) => hRec[n] ?? 0, [hRec]);
  const hStar = useMemo(() => costToGo(neighboursOf(map.graph), ids, goal), [map, ids, goal]);
  const hBad = useMemo(() => new Set(ids.filter((n) => hRec[n] > (hStar.get(n) ?? Infinity) + 1e-9)), [ids, hRec, hStar]);
  const hEdited = useMemo(() => new Set(Object.keys(edits)), [edits]);

  const trace = useMemo(() => runExam(map.graph, start, goal, algo, hOf), [map, start, goal, algo, hOf]);
  const compare = useMemo(
    () =>
      ALGOS.map((a) => {
        const t = a === algo ? trace : runExam(map.graph, start, goal, a, hOf);
        return { algo: a, pops: t.steps.length, path: t.path, cost: t.cost };
      }),
    [map, start, goal, hOf, algo, trace]
  );
  const optimum = hStar.get(start) ?? Infinity;

  const st = useStepper(trace.steps.length, { speed: 1 });
  const [jump, setJump] = useState<{ to: number | 'end' } | null>(null);
  const { setI, n: stepsN } = st;
  useEffect(() => {
    if (!jump) return;
    setI(jump.to === 'end' ? stepsN : jump.to);
    setJump(null);
  }, [jump, setI, stepsN]);

  const i = st.i;
  const step = i > 0 ? trace.steps[i - 1] : null;
  const finished = trace.steps.length > 0 && i >= trace.steps.length;
  const reached = finished && !!trace.path;
  const name = map.name;

  // ---------------------------------------------------------------- actions
  const restart = (to: number | 'end' = 0) => {
    setDrive(FRESH);
    setJump({ to });
  };
  const chooseMap = (k: MapKey) => {
    setMapKey(k);
    restart(0);
  };
  const newRandom = () => {
    setMapKey('random');
    setSeed(freshSeed());
    restart(0);
  };
  const chooseAlgo = (a: Algo) => {
    setAlgo(a);
    restart(0);
  };
  const setEnds = (s: string, g: string) => {
    setEndsRaw({ id: mapId, start: s, goal: g });
    restart(0);
  };
  const resetQuestion = () => {
    setEndsRaw({ id: mapId, start: map.start, goal: map.goal });
    setHEditRaw({ id: '', edits: {} });
    restart(0);
  };
  const editH = (node: string, v: number) => {
    setHEditRaw({ id: hId, edits: { ...edits, [node]: v } });
    restart('end');
  };
  const clearH = () => {
    setHEditRaw({ id: hId, edits: {} });
    restart('end');
  };
  const chooseMode = (m: 'watch' | 'drive') => {
    setMode(m);
    restart(0);
  };

  /** Set up a scenario for a prediction and scroll the map into view. */
  const scenario = (o: { map: MapKey; algo: Algo; start?: string; goal?: string; edits?: Record<string, number>; to: number | 'end' }) => {
    const m = o.map === mapKey ? map : makeMap(o.map, seed);
    const id = `${m.key}:${m.seed ?? ''}`;
    const s = o.start ?? m.start;
    const g = o.goal ?? m.goal;
    setMapKey(o.map);
    setAlgo(o.algo);
    setMode('watch');
    setEndsRaw({ id, start: s, goal: g });
    setHEditRaw({ id: `${id}:${g}`, edits: o.edits ?? {} });
    restart(o.to);
    requestAnimationFrame(() => {
      const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      rootRef.current?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    });
  };

  // ---------------------------------------------------------------- you drive
  const next = i < trace.steps.length ? trace.steps[i] : null;
  const entries = useMemo(() => (next && drive.phase !== 'pick' ? expectedEntries(next, algo, name) : []), [next, drive.phase, algo, name]);
  const q = typedQuantity(algo);

  const drivePick = (id: string) => {
    if (!next || drive.phase !== 'pick') return;
    const v = judgePop(next, id, algo, name, goal);
    const first = !drive.pickTried.includes(next.k);
    const upd: Drive = {
      ...drive,
      verdict: { ...v, k: next.k },
      flash: { node: id, ok: v.ok },
      pickTried: first ? [...drive.pickTried, next.k] : drive.pickTried,
      pickScore: first ? [drive.pickScore[0] + (v.ok ? 1 : 0), drive.pickScore[1] + 1] : drive.pickScore,
    };
    if (!v.ok) {
      setDrive(upd);
      return;
    }
    if (!next.isGoal && typing && q && expectedEntries(next, algo, name).length > 0) {
      setDrive({ ...upd, phase: 'type', typed: {}, results: null });
      return;
    }
    setDrive({ ...upd, phase: 'pick' });
    setI(i + 1);
  };
  const checkTyped = () => {
    if (!next) return;
    const res: Record<string, { ok: boolean; message: string }> = {};
    let right = 0;
    for (const e of entries) {
      const r = judgeEntry(e, evaluate(drive.typed[e.node] ?? ''), algo, name);
      res[e.node] = r;
      if (r.ok) right++;
    }
    const first = !drive.valsTried.includes(next.k);
    setDrive({
      ...drive,
      phase: 'checked',
      results: res,
      valsTried: first ? [...drive.valsTried, next.k] : drive.valsTried,
      valScore: first ? [drive.valScore[0] + right, drive.valScore[1] + entries.length] : drive.valScore,
    });
  };
  const applyStep = () => {
    setDrive((d) => ({ ...d, phase: 'pick', typed: {}, results: null, flash: null }));
    setI(i + 1);
  };
  const revealStep = () => {
    if (!next) return;
    const first = !drive.pickTried.includes(next.k);
    setDrive((d) => ({
      ...d,
      phase: 'pick',
      typed: {},
      results: null,
      flash: null,
      verdict: { ok: true, k: next.k, message: `Shown: ${popLine(next, algo, name, goal)}` },
      pickTried: first ? [...d.pickTried, next.k] : d.pickTried,
      pickScore: first ? [d.pickScore[0], d.pickScore[1] + 1] : d.pickScore,
      revealed: d.revealed + 1,
    }));
    setI(i + 1);
  };

  const perfect =
    mode === 'drive' &&
    finished &&
    drive.revealed === 0 &&
    drive.pickScore[1] === trace.steps.length &&
    drive.pickScore[0] === drive.pickScore[1] &&
    drive.valScore[1] > 0 &&
    drive.valScore[0] === drive.valScore[1];
  const challengeRun = perfect && map.key === 'random' && algo === 'astar' && typing;
  useEffect(() => {
    if (challengeRun) completeChallenge(ASTAR_CHALLENGE);
  }, [challengeRun]);
  const challengeDone = !!progress.challenges[ASTAR_CHALLENGE];

  const onNode = (id: string) => {
    if (mode === 'drive') {
      drivePick(id);
      return;
    }
    if (clickRole === 'start') {
      if (id !== goal) setEnds(id, goal);
    } else if (id !== start) setEnds(start, id);
  };

  // ---------------------------------------------------------------- what the map shows
  const view: GraphView = {
    open: openAt(trace, i),
    closed: closedAt(trace, i),
    popped: step?.popped ?? null,
    updates: step?.updates ?? [],
    path: reached ? trace.path : null,
    pending: mode === 'drive' && drive.phase !== 'pick' ? next?.popped ?? null : null,
    flash: mode === 'drive' ? drive.flash : null,
  };

  const goalNote = (() => {
    const ga = trace.goalAdded;
    if (!reached || !ga) return '';
    const popK = trace.steps.length;
    if (Math.abs(ga.g - trace.cost) > 1e-9)
      return ` ${name(goal)} first entered Open at step ${ga.k} with $g = ${num(ga.g)}$ (via ${name(ga.parent)}); a cheaper parent replaced it before it was popped at step ${popK}. Stopping when it was first added would have answered ${num(ga.g)} ${map.unit}: wrong.`;
    if (ga.k < popK) return ` ${name(goal)} entered Open at step ${ga.k} but was only popped at step ${popK}: until then a town with lower ${algo === 'astar' ? '$f$' : 'priority'} might still have led to a cheaper route.`;
    return '';
  })();

  const narrative = (() => {
    if (!step) {
      const r0 = trace.initial[0];
      const pr = algo === 'astar' ? `$g = 0$, $f = 0 + ${num(r0?.h ?? 0)} = ${num(r0?.f ?? 0)}$` : '$g = 0$';
      return `**Start.** Open holds only the start ${name(start)} (${pr}); Closed is empty. Each step pops ${algo === 'astar' ? 'the lowest $f = g + h$' : algo === 'dijkstra' ? 'the lowest $g$' : algo === 'greedy' ? 'the lowest $h$' : 'the oldest town in the queue'} and updates its neighbours.`;
    }
    const lines = step.updates.map((u) => `- ${updateLine(u, step, algo, name)}`);
    let s = `**Step ${step.k}.** ${popLine(step, algo, name, goal)}${lines.length ? `\n\n${lines.join('\n')}` : ''}`;
    if (reached && trace.path) {
      const sum = pathSum(map.graph, trace.path);
      const back = trace.path.slice().reverse().map(name).join(' ← ');
      const verdict =
        Math.abs(trace.cost - optimum) < 1e-9
          ? 'This is the shortest route.'
          : `The shortest route is ${num(optimum)} ${map.unit}, so this one is **${num(trace.cost - optimum)} ${map.unit} longer**${algo === 'astar' ? ' (the heuristic overestimates somewhere)' : algo === 'bfs' ? ' (BFS minimises roads, not kilometres)' : algo === 'greedy' ? ' (greedy ignores the distance already driven)' : ''}.`;
      s += `\n\n**Done.** Follow the parents back: ${back}. Route ${trace.path.map(name).join(' → ')}, length $${sum.text}$ ${map.unit}. ${verdict}${goalNote}`;
    } else if (finished && !trace.path) s += '\n\nOpen is empty and the goal was never popped: there is no route.';
    return s;
  })();

  // ---------------------------------------------------------------- heuristic lab
  const maxHStar = Math.max(...ids.map((n) => (Number.isFinite(hStar.get(n) ?? NaN) ? hStar.get(n)! : 0)));
  const big = maxHStar > 200;
  const hStep = big ? 50 : 0.1;
  const hMax = big ? Math.ceil((2.2 * maxHStar) / 500) * 500 : Math.ceil(2.2 * maxHStar);
  const optPath = compare.find((c) => c.algo === 'dijkstra')?.path ?? [];
  const defaultLab = map.key === 'brisbane' ? 'SB' : optPath[Math.floor(optPath.length / 2)] ?? ids[0];
  const [labRaw, setLab] = useState<{ id: string; node: string }>({ id: '', node: '' });
  const labNode = labRaw.id === hId && ids.includes(labRaw.node) ? labRaw.node : defaultLab;
  const astarRes = compare.find((c) => c.algo === 'astar')!;
  const hTableMissing = map.tableGoal !== null && goal !== map.tableGoal;

  const driveCard = (
    <div className="plan-astar-card plan-astar-ctrl" aria-live="polite">
      <div className="plan-astar-stephead">
        <strong>{finished ? 'Run complete' : `Step ${i + 1}: which town does ${ALGO_SHORT[algo]} pop next?`}</strong>
        <span className="plan-astar-score">
          <Badge tone={drive.pickScore[0] === drive.pickScore[1] ? 'ok' : 'warn'} title="right first time / attempted">
            pops {drive.pickScore[0]}/{drive.pickScore[1]}
          </Badge>
          {q && (
            <Badge tone={drive.valScore[0] === drive.valScore[1] ? 'ok' : 'warn'} title="right first time / typed">
              {q} values {drive.valScore[0]}/{drive.valScore[1]}
            </Badge>
          )}
        </span>
      </div>
      {!finished && drive.phase === 'pick' && <p className="plan-astar-sub">Tap the town on the map. Open is listed unsorted below: find the lowest priority yourself.</p>}
      {drive.verdict && (
        <Callout kind={drive.verdict.ok ? 'ok' : 'bad'} title={`Step ${drive.verdict.k}: ${drive.verdict.ok ? (drive.verdict.tie ? 'tie: accepted' : 'right') : 'not that one'}`}>
          <Rich text={drive.verdict.message} />
        </Callout>
      )}
      {next && drive.phase !== 'pick' && (
        <div className="plan-astar-entries">
          <Rich
            text={`Expand **${name(next.popped)}** ($g = ${num(next.row.g)}$). For each neighbour not in Closed, type the ${q === 'f' ? '$f = g + h$' : '$g$'} it has in Open **after** this step (unchanged if the new route is not cheaper). Expressions like \`4.1+3.7+7.1\` are fine.`}
          />
          {entries.map((e) => {
            const r = drive.results?.[e.node];
            return (
              <div key={e.node} className="plan-astar-entry">
                <label htmlFor={`astar-in-${e.node}`}>
                  {name(e.node)}: {q}
                </label>
                <input
                  id={`astar-in-${e.node}`}
                  className={`plan-astar-in${r ? (r.ok ? ' is-ok' : ' is-bad') : ''}`}
                  inputMode="decimal"
                  autoComplete="off"
                  value={drive.typed[e.node] ?? ''}
                  disabled={drive.phase === 'checked'}
                  onChange={(ev) => setDrive({ ...drive, typed: { ...drive.typed, [e.node]: ev.target.value } })}
                  onKeyDown={(ev) => ev.key === 'Enter' && drive.phase === 'type' && checkTyped()}
                />
                <span className="muted small">h = {num(e.h)}</span>
                {r && <Rich className={`plan-astar-msg ${r.ok ? 'is-ok' : 'is-bad'}`} text={r.message} />}
              </div>
            );
          })}
          <div className="plan-astar-row">
            {drive.phase === 'type' ? (
              <>
                <Button variant="primary" onClick={checkTyped} disabled={entries.some((e) => !(drive.typed[e.node] ?? '').trim())}>
                  Check values
                </Button>
                <Button onClick={applyStep}>Skip typing</Button>
              </>
            ) : (
              <Button variant="primary" onClick={applyStep}>
                Apply step {next.k} ▸
              </Button>
            )}
          </div>
        </div>
      )}
      <div className="plan-astar-row">
        {!finished && drive.phase === 'pick' && (
          <Button size="sm" onClick={revealStep}>
            Show me this step
          </Button>
        )}
        <Button size="sm" onClick={() => restart(0)}>
          ⏮ Restart run
        </Button>
        {q && <Toggle checked={typing} onChange={setTyping} label={`type the ${q} values too`} />}
      </div>
      {finished && (
        <Callout kind={perfect ? 'ok' : 'note'} title={perfect ? 'Clean run: every pop and value right first time' : `Pops right first time: ${drive.pickScore[0]}/${drive.pickScore[1]}${q ? `; values ${drive.valScore[0]}/${drive.valScore[1]}` : ''}`}>
          {challengeRun ? (
            <p>Challenge complete: that is exactly the 7-mark exam question, done cleanly.</p>
          ) : (
            <p>
              {map.key !== 'random' || algo !== 'astar' || !typing
                ? 'The challenge needs A* on a random map with the values typed.'
                : 'Restart, or press “New random map”, for another go at a clean run.'}
              {challengeDone ? ' (Challenge already completed.)' : ''}
            </p>
          )}
        </Callout>
      )}
    </div>
  );

  const watchCard = (
    <div className="plan-astar-card plan-astar-ctrl">
      <StepControls st={st} label="pop" speeds={[0.5, 1, 2, 4]} />
      <div className="plan-astar-row">
        <Badge tone="m2">Open {view.open.length}</Badge>
        <Badge tone="m1">Closed {view.closed.length}</Badge>
        {reached && trace.path && <Badge tone={Math.abs(trace.cost - optimum) < 1e-9 ? 'ok' : 'bad'}>{`${num(trace.cost)} ${map.unit}${Math.abs(trace.cost - optimum) < 1e-9 ? ' ✓ shortest' : ' ✗ not shortest'}`}</Badge>}
      </div>
    </div>
  );

  return (
    <div className="plan-astar-root" ref={rootRef}>
      <div className="plan-astar-toolbar">
        <div className="plan-astar-toolgroup">
          <span className="plan-astar-toollabel">Map</span>
          <Segmented
            size="sm"
            label="Road map"
            value={mapKey}
            onChange={chooseMap}
            options={[
              { value: 'brisbane', label: 'Brisbane 2024 Q29', title: 'Kelvin Grove to Mount Gravatt, the 2024 exam' },
              { value: 'australia', label: 'Australia (review)', title: 'Hobart to Alice Springs, review deck slide 17' },
              { value: 'random', label: 'Random', title: 'A random road map (to scale)' },
            ]}
          />
          {mapKey === 'random' && (
            <Button size="sm" onClick={newRandom} title="Draw another random road map">
              ⟳ New random map
            </Button>
          )}
        </div>
        <div className="plan-astar-toolgroup">
          <span className="plan-astar-toollabel">Search</span>
          <Segmented size="sm" label="Search algorithm" value={algo} onChange={chooseAlgo} options={ALGOS.map((a) => ({ value: a, label: ALGO_SHORT[a] }))} />
        </div>
        <div className="plan-astar-toolgroup">
          <span className="plan-astar-toollabel">Mode</span>
          <Segmented
            size="sm"
            label="Mode"
            value={mode}
            onChange={chooseMode}
            options={[
              { value: 'watch', label: 'Watch', title: 'Step through the search' },
              { value: 'drive', label: 'You drive', title: 'Pick each pop and type each value yourself' },
            ]}
          />
        </div>
      </div>

      <div className="plan-astar-main">
        <div className="plan-astar-col">
          <div className="plan-astar-card plan-astar-graph">
            <RoadGraph
              map={map}
              start={start}
              goal={goal}
              h={showH ? hOf : undefined}
              hBad={hBad}
              hEdited={hEdited}
              view={view}
              algo={algo}
              showValues={showValues}
              onNode={onNode}
              nodeAction={mode === 'drive' ? 'pop it next' : `make it the ${clickRole}`}
              ariaLabel={`${map.title}: road map from ${name(start)} to ${name(goal)}, ${ALGO_SHORT[algo]} after ${i} pops`}
            />
            <div className="plan-astar-legend" aria-hidden="true">
              <span>
                <i className="plan-astar-dot is-open" /> Open (frontier)
              </span>
              <span>
                <i className="plan-astar-dot is-closed" /> Closed (expanded)
              </span>
              <span>
                <i className="plan-astar-swatch is-tent" /> parent, may change
              </span>
              <span>
                <i className="plan-astar-swatch is-final" /> parent, final
              </span>
              <span>
                <i className="plan-astar-swatch is-relax" /> roads used this step
              </span>
              <span>
                <i className="plan-astar-swatch is-replaced" /> parent replaced
              </span>
              <span>
                <i className="plan-astar-swatch is-path" /> route found
              </span>
            </div>
            <div className="plan-astar-row">
              {mode === 'watch' ? (
                <>
                  <span className="small muted">Tap a town to make it the</span>
                  <Segmented
                    size="sm"
                    label="Tapping a town sets the"
                    value={clickRole}
                    onChange={setClickRole}
                    options={[
                      { value: 'start', label: 'start' },
                      { value: 'goal', label: 'goal' },
                    ]}
                  />
                </>
              ) : (
                <span className="small muted">Tap the town that is popped next.</span>
              )}
              <Toggle checked={showH} onChange={setShowH} label="h on map" />
              <Toggle checked={showValues} onChange={setShowValues} label="f / g on map" />
              {(map.key !== 'random' && (start !== map.start || goal !== map.goal || hEdited.size > 0)) && (
                <Button size="sm" variant="ghost" onClick={resetQuestion}>
                  Back to the exam question
                </Button>
              )}
            </div>
            {hTableMissing && (
              <Callout kind="warn" title={`No heuristic table for ${name(goal)}`}>
                <Rich text={`The printed table gives straight-line distances to ${name(map.tableGoal!)} only. With goal ${name(goal)} every $h = 0$, so A* and greedy fall back to Dijkstra-like behaviour. Random maps compute $h$ for any goal.`} />
              </Callout>
            )}
          </div>
          <div className="plan-astar-card plan-astar-narr" aria-live="polite">
            <Rich text={narrative} />
          </div>
        </div>
        <div className="plan-astar-col">
          {mode === 'drive' ? driveCard : watchCard}
          <div className="plan-astar-tables">
            <div className="plan-astar-card plan-astar-tablecard">
              <OpenTable rows={view.open} algo={algo} name={name} unsorted={mode === 'drive'} showNext={mode === 'watch' && !finished} />
            </div>
            <div className="plan-astar-card plan-astar-tablecard">
              <ClosedTable rows={view.closed} name={name} just={step?.popped} />
            </div>
          </div>
        </div>
      </div>

      <div className="plan-astar-below">
        <div className="plan-astar-two">
          <div className="plan-astar-card">
            <h3 className="plan-astar-h3">Same question, four searches</h3>
            <p className="plan-astar-sub">
              {name(start)} to {name(goal)} with the current heuristic. Tap a name to step through it.
            </p>
            <div className="plan-astar-scroll">
              <table className="plan-astar-compare">
                <thead>
                  <tr>
                    <th scope="col">Search</th>
                    <th scope="col">Pops by</th>
                    <th scope="col">Pops</th>
                    <th scope="col">Route</th>
                    <th scope="col">Length</th>
                  </tr>
                </thead>
                <tbody>
                  {compare.map((c) => {
                    const best = Math.abs(c.cost - optimum) < 1e-9;
                    return (
                      <tr key={c.algo} className={c.algo === algo ? 'is-on' : ''}>
                        <th scope="row">
                          <button type="button" className="plan-astar-linkbtn" onClick={() => chooseAlgo(c.algo)} aria-pressed={c.algo === algo}>
                            {ALGO_SHORT[c.algo]}
                          </button>
                        </th>
                        <td>
                          <Rich text={ALGO_RULE[c.algo]} inline />
                        </td>
                        <td className="mono">{c.pops}</td>
                        <td className="plan-astar-pathcell">{c.path ? c.path.map(name).join(' → ') : 'none'}</td>
                        <td className="mono">
                          {num(c.cost)} {best ? <span className="ok-text">✓</span> : <span className="bad-text">✗ +{num(c.cost - optimum)}</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Rich
              className="note"
              text={`✓ marks the true shortest route (${num(optimum)} ${map.unit}). Dijkstra and A* (with an admissible $h$) are guaranteed it; greedy and BFS only get it by luck. A* needs fewer pops than Dijkstra because $h$ steers it towards the goal.`}
            />
          </div>
          <div className="plan-astar-card">
            <h3 className="plan-astar-h3">Break the heuristic</h3>
            <Rich
              className="plan-astar-sub"
              text={`Admissible means $h(n) \\le h^*(n)$, the true shortest road distance to ${name(goal)}, for every town. Overestimate one town and run A* again.`}
            />
            <div className="plan-astar-row">
              <Select label="Town whose h to edit" value={labNode} onChange={(v) => setLab({ id: hId, node: v })} options={ids.filter((n) => n !== goal).map((n) => ({ value: n, label: `h(${name(n)})` }))} />
              {map.key === 'brisbane' && goal === 'MG' && (
                <Button size="sm" onClick={() => editH('SB', 20)}>
                  Try h(SB) = 20
                </Button>
              )}
              {hEdited.size > 0 && (
                <Button size="sm" variant="ghost" onClick={clearH}>
                  Restore the table
                </Button>
              )}
            </div>
            <Slider
              label={`h(${name(labNode)})`}
              tex="h"
              tip={`heuristic of ${name(labNode)}: estimated distance to the goal (${map.unit})`}
              value={hRec[labNode] ?? 0}
              min={0}
              max={hMax}
              step={hStep}
              unit={map.unit}
              onChange={(v) => editH(labNode, big ? Math.round(v / 50) * 50 : Math.round(v * 10) / 10)}
            />
            <Callout
              kind={Math.abs(astarRes.cost - optimum) < 1e-9 ? (hBad.size ? 'warn' : 'ok') : 'bad'}
              title={
                Math.abs(astarRes.cost - optimum) < 1e-9
                  ? hBad.size
                    ? 'Still shortest, but no longer guaranteed'
                    : 'Admissible: A* is guaranteed the shortest route'
                  : `A* returns a route ${num(astarRes.cost - optimum)} ${map.unit} too long`
              }
            >
              <Rich
                text={`A* returns ${astarRes.path ? astarRes.path.map(name).join(' → ') : 'no route'} (${num(astarRes.cost)} ${map.unit}); the shortest is ${num(optimum)} ${map.unit}.${
                  hBad.size
                    ? ` Overestimates: ${[...hBad].map((n) => `$h(\\text{${name(n)}}) = ${num(hRec[n])} > h^* = ${num(hStar.get(n) ?? NaN)}$`).join(', ')}.${Math.abs(astarRes.cost - optimum) < 1e-9 ? ' An inadmissible $h$ *can* still find the best route; it just loses the proof.' : ' The goal was popped before the cheaper route through the overestimated town was explored.'}`
                    : ''
                }`}
              />
            </Callout>
            <More label={`h and h* for every town (${map.unit})`}>
              <div className="plan-astar-scroll">
                <table className="plan-astar-compare plan-astar-hlab">
                  <thead>
                    <tr>
                      <th scope="col">Town</th>
                      <th scope="col">h</th>
                      <th scope="col">h* (true)</th>
                      <th scope="col">h ≤ h*?</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ids.map((n) => {
                      const bad = hBad.has(n);
                      return (
                        <tr key={n}>
                          <th scope="row" className={bad ? 'is-bad' : ''}>
                            {name(n)}
                          </th>
                          <td className={`mono${bad ? ' is-bad' : ''}`}>{num(hRec[n])}</td>
                          <td className="mono">{num(hStar.get(n) ?? NaN)}</td>
                          <td className={bad ? 'is-bad' : 'ok-text'}>{bad ? '✗ overestimates' : '✓'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </More>
          </div>
        </div>

        <PredictReveal
          id="plan-astar-stop-rule"
          question="**Australia, after step 3:** Alice Springs (the goal) is already in Open with $f = 2600$, but Adelaide has $f = 2550$. What does A* do at step 4?"
          options={['Stop: the goal has been found, 2600 km', 'Pop Adelaide: a route through it could still cost as little as 2550 km', 'Pop Alice Springs: the goal jumps the queue']}
          answer={1}
          explain="The goal test is at the **pop**, not when the goal enters Open. $f(\text{Adelaide}) = 1300 + 1250 = 2550 < 2600$ means a route through Adelaide *might* reach Alice Springs in 2550 km, so A* must expand Adelaide first. It doesn't help here (via Adelaide: $1300 + 1400 = 2700 > 2600$, no change), and Alice Springs is popped at step 5 with 2600 km. Had the Adelaide road been 1200 km, stopping at step 3 would have missed a 2500 km route."
          tryIt="load Australia and step to 4: Adelaide is popped, and its road to Alice Springs is shown as not cheaper."
          onApply={() => scenario({ map: 'australia', algo: 'astar', to: 4 })}
        />
        <PredictReveal
          id="plan-astar-optimal-pop"
          question="**Brisbane, after step 4:** MG has $f = 13.8$ and DP has $f = 13.9$. When MG is popped at step 5, is 13.8 km *guaranteed* to be the shortest?"
          options={['Yes: any other route costs at least the f of an Open town, ≥ 13.9', 'No: DP is so close that its route might be shorter', 'Only after DP has been expanded as well']}
          answer={0}
          explain="With an admissible $h$, $f(n) = g(n) + h(n)$ never overestimates the cost of the best route through $n$. Every route not yet finished passes through some Open town, and all of them have $f \ge 13.9 > 13.8$. So the moment MG is popped its 13.8 km is proven shortest. (The runner-up, KG–GP–SB–DP–MG, is 14.4 km.)"
          tryIt="step to 5 and read the Open list that is left."
          onApply={() => scenario({ map: 'brisbane', algo: 'astar', to: 5 })}
        />
        <PredictReveal
          id="plan-astar-bfs"
          question="Breadth-first search from **KG to SL** (the example in the 2024 worked solution). Which route does it return?"
          options={['KG → H → SL, 8.6 km', 'KG → GP → SB → SL, 7.8 km', 'KG → H → GP → SB → SL, 10.4 km']}
          answer={0}
          explain="BFS pops in arrival order, so it returns the route with the **fewest roads** (KG–H–SL, 2 roads, 8.6 km) and never looks at the lengths. Dijkstra and A* return KG–GP–SB–SL, 7.8 km, with one road more. That is why BFS is the wrong tool on a road map with uneven lengths (2024 Q29a); it is only optimal when every edge costs the same."
          tryIt="run BFS from KG to SL, then switch the search to Dijkstra."
          onApply={() => scenario({ map: 'brisbane', algo: 'bfs', start: 'KG', goal: 'SL', to: 'end' })}
        />
        <PredictReveal
          id="plan-astar-inadmissible"
          question="Overestimate one heuristic: set $h(\text{SB}) = 20$ km (its true road distance to MG is 9.7 km). Which route does A* return now?"
          options={['Still KG → GP → SB → MG, 13.8 km', 'KG → H → SL → DP → MG, 17.9 km', 'No route at all']}
          answer={1}
          explain="SB's $f = 4.1 + 20 = 24.1$ parks it at the back of Open, so A* reaches MG through SL and DP first and pops it with $g = 17.9$: the pop no longer proves anything, because $f$ overestimated the route through SB. Try $h(\text{SB}) = 13$ too: also inadmissible, yet A* still finds 13.8 km. Overestimating *can* break A*; admissibility is what guarantees it never does."
          tryIt="press “Try h(SB) = 20” in Break the heuristic, then drag the slider down to 13."
          onApply={() => scenario({ map: 'brisbane', algo: 'astar', edits: { SB: 20 }, to: 'end' })}
        />
        <PredictReveal
          id="plan-astar-dijkstra-pops"
          question="Dijkstra (A* with $h = 0$) on the same question, KG to MG. How many pops until it stops? (A* needed 5.)"
          options={['5, the same as A*', '7', 'All 8 towns']}
          answer={1}
          explain="Dijkstra pops by $g$ alone: KG, H, GP, SB, DP, SL, then MG, so 7 pops for the same 13.8 km route. With the straight-line $h$, DP and SL have $f = 13.9$ and $14.9 > 13.8$, so A* never needs them. A better (larger, still admissible) heuristic means fewer expansions; $h = 0$ is the weakest admissible heuristic."
          tryIt="switch the search to Dijkstra and compare the pops column."
          onApply={() => scenario({ map: 'brisbane', algo: 'dijkstra', to: 'end' })}
        />

        <More label="Every step as you would write it in the exam">
          <div className="plan-astar-sheet">
            {trace.steps.map((s) => (
              <div key={s.k} className="plan-astar-sheet-step">
                <Rich text={`**Step ${s.k}:** pop ${name(s.popped)}${s.isGoal ? ' (goal: stop)' : ''}`} />
                <OpenTable rows={s.open} algo={algo} name={name} showNext={false} />
                <ClosedTable rows={s.closed} name={name} just={s.popped} />
              </div>
            ))}
          </div>
          {trace.path && <Rich text={`**Route:** ${trace.path.map(name).join(' → ')}, **${num(trace.cost)} ${map.unit}**.`} />}
        </More>
      </div>
    </div>
  );
}
