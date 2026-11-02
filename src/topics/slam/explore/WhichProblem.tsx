// "Localisation, mapping or SLAM?" as an interactive: for each scenario card, mark whether the robot's pose and
// the map are given or unknown. The problem then follows from the 2 × 2 table (summary notes §4), and the
// posterior builder shows the same decision as notation: unknowns move left of the conditioning bar, givens
// right. SLAM cards add "online or full?" (2023 Q7-8, 2024 Q7-8, 2025 Q7-8).
import { useEffect, useRef } from 'react';
import type { ExploreItem } from '../../../engine/types';
import { Button, Callout, More, Segmented } from '../../../ui/kit';
import { PredictReveal } from '../../../ui/PredictReveal';
import { Rich, TeX } from '../../../ui/Rich';
import { usePersisted } from '../../../ui/persist';
import { completeChallenge, useProgress } from '../../../app/store';
import { POSTERIOR, PROBLEM_LABEL, SCENARIOS, problemOf, scenarioById, type Known, type Problem, type SlamKind } from './whichData';
import { revealEl } from './slamCommon';

export const meta: Omit<ExploreItem, 'component'> = {
  id: 'which-problem',
  title: 'Localisation, mapping or SLAM?',
  summary:
    'Eleven robots, one question each: is the pose given, is the map given? Mark both and the problem follows from the 2 × 2 table, with its posterior written in the course’s notation. SLAM cards add online vs full SLAM.',
  notice: 'Everything follows from what is **unknown**: unknowns go left of the bar in $p(\\cdot \\mid \\cdot)$, givens go right. Pose given + map unknown = mapping; pose unknown + map given = localisation; both unknown = SLAM.',
  challenge: { id: 'slam-which-all', title: 'Classify all eleven scenarios correctly (SLAM ones including online vs full)' },
  minutes: 6,
};

const CHALLENGE_ID = 'slam-which-all';

interface Mark {
  pose?: Known;
  map?: Known;
  /** Result of the last check of pose + map. */
  ok?: boolean;
  slam?: SlamKind;
  slamOk?: boolean;
}
type Marks = Record<string, Mark>;

const CELL: { pose: Known; map: Known }[] = [
  { pose: 'known', map: 'known' },
  { pose: 'known', map: 'unknown' },
  { pose: 'unknown', map: 'known' },
  { pose: 'unknown', map: 'unknown' },
];

const CELL_TEX: Record<Problem, string> = {
  none: '\\text{nothing to estimate}',
  mapping: POSTERIOR.mapping,
  localisation: POSTERIOR.localisation,
  slam: POSTERIOR.online,
};

const CELL_EG: Record<Problem, string> = {
  none: 'e.g. an arm with encoders in a CAD cell',
  mapping: 'e.g. a satellite with GPS building a temperature map',
  localisation: 'e.g. a forklift with a tag map',
  slam: 'e.g. a lunar rover: no map, no GPS',
};

export default function WhichProblem() {
  const [sel, setSel] = usePersisted<string>('slam-which:sel', SCENARIOS[0].id);
  const [marks, setMarks] = usePersisted<Marks>('slam-which:marks', {});
  const leftRef = useRef<HTMLDivElement>(null);
  const challengeDone = !!useProgress().challenges[CHALLENGE_ID];
  const sc = scenarioById(sel);
  const mk = marks[sc.id] ?? {};
  const picked = mk.pose && mk.map ? problemOf(mk.pose, mk.map) : null;
  const truth = problemOf(sc.pose, sc.map);
  const set = (id: string, m: Partial<Mark>) => setMarks((all) => ({ ...all, [id]: { ...(all[id] ?? {}), ...m } }));

  const doneAll = SCENARIOS.every((s) => marks[s.id]?.ok && (problemOf(s.pose, s.map) !== 'slam' || marks[s.id]?.slamOk));
  const nOk = SCENARIOS.filter((s) => marks[s.id]?.ok).length;
  useEffect(() => {
    if (doneAll && !challengeDone) completeChallenge(CHALLENGE_ID);
  }, [doneAll, challengeDone]);

  const check = () => set(sc.id, { ok: mk.pose === sc.pose && mk.map === sc.map });
  const next = () => {
    const i = SCENARIOS.findIndex((s) => s.id === sc.id);
    const after = [...SCENARIOS.slice(i + 1), ...SCENARIOS.slice(0, i + 1)];
    const todo = after.find((s) => !marks[s.id]?.ok) ?? after[0];
    setSel(todo.id);
  };
  const show = (id: string, m: Mark) => {
    setSel(id);
    set(id, m);
    revealEl(leftRef.current, '.slam-which-table');
  };

  // ---------------------------------------------------------------- the table + posterior builder
  const left = (
    <div className="slam-left slam-panel" ref={leftRef}>
      <PosteriorBuilder pose={mk.pose} map={mk.map} slam={mk.slam} />
      <div className="slam-which-table" role="table" aria-label="What is unknown decides the problem">
        <div className="slam-which-corner" role="columnheader" />
        <div className="slam-which-head" role="columnheader">
          map <strong>given</strong>
        </div>
        <div className="slam-which-head" role="columnheader">
          map <strong>unknown</strong>
        </div>
        {(['known', 'unknown'] as Known[]).map((pose) => (
          <div key={pose} className="slam-which-row" role="row">
            <div className="slam-which-rowhead" role="rowheader">
              pose <strong>{pose === 'known' ? 'given' : 'unknown'}</strong>
            </div>
            {CELL.filter((c) => c.pose === pose).map((c) => {
              const p = problemOf(c.pose, c.map);
              const isPick = picked === p;
              const verdict = mk.ok !== undefined && isPick ? (mk.ok ? 'is-right' : 'is-wrong') : '';
              const isTruth = mk.ok === false && p === truth;
              return (
                <button
                  key={c.map}
                  type="button"
                  role="cell"
                  className={`slam-which-cell is-${p} ${isPick ? 'is-pick' : ''} ${verdict} ${isTruth ? 'is-truth' : ''}`}
                  onClick={() => set(sc.id, { pose: c.pose, map: c.map, ok: undefined })}
                  title={`Mark: pose ${c.pose}, map ${c.map}`}
                >
                  <span className="slam-which-name">
                    {verdict === 'is-right' ? '✓ ' : verdict === 'is-wrong' ? '✗ ' : ''}
                    {PROBLEM_LABEL[p]}
                  </span>
                  <span className="slam-which-tex">
                    <TeX>{CELL_TEX[p]}</TeX>
                  </span>
                  {p === 'slam' && (
                    <span className="slam-which-tex is-small">
                      full: <TeX>{POSTERIOR.full}</TeX>
                    </span>
                  )}
                  <span className="slam-which-eg">{CELL_EG[p]}</span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
      <Rich className="note" text="Click a cell, or use the two switches on the right. The problem is decided by the **unknowns**: whatever is not given has to be estimated." />
    </div>
  );

  // ---------------------------------------------------------------- the cards
  const right = (
    <div className="slam-right">
      <section className="slam-panel">
        <div className="slam-bar" style={{ justifyContent: 'space-between' }}>
          <h4 style={{ margin: 0 }}>Scenarios</h4>
          <span className="small muted">
            {nOk} / {SCENARIOS.length} classified
          </span>
        </div>
        <div className="slam-which-cards" role="list">
          {SCENARIOS.map((s) => {
            const m = marks[s.id];
            const st = m?.ok === true ? (problemOf(s.pose, s.map) === 'slam' && !m.slamOk ? 'half' : 'ok') : m?.ok === false ? 'bad' : '';
            return (
              <button key={s.id} type="button" role="listitem" className={`slam-which-card ${s.id === sc.id ? 'is-sel' : ''} is-${st || 'todo'}`} onClick={() => setSel(s.id)}>
                <span className="slam-which-mark" aria-hidden="true">
                  {st === 'ok' ? '✓' : st === 'bad' ? '✗' : st === 'half' ? '½' : '•'}
                </span>
                {s.title}
              </button>
            );
          })}
        </div>
      </section>

      <section className="slam-panel" aria-live="polite">
        <h4>{sc.title}</h4>
        <Rich text={sc.text} />
        {sc.source && <div className="small muted">{sc.source}</div>}
        <div className="slam-which-qs">
          <div className="slam-which-q">
            <span className="slam-label">Pose</span>
            <Segmented
              size="sm"
              label="Is the pose given?"
              value={mk.pose as Known}
              onChange={(v) => set(sc.id, { pose: v as Known, ok: undefined })}
              options={[
                { value: 'known', label: 'given' },
                { value: 'unknown', label: 'unknown' },
              ]}
            />
          </div>
          <div className="slam-which-q">
            <span className="slam-label">Map</span>
            <Segmented
              size="sm"
              label="Is the map given?"
              value={mk.map as Known}
              onChange={(v) => set(sc.id, { map: v as Known, ok: undefined })}
              options={[
                { value: 'known', label: 'given' },
                { value: 'unknown', label: 'unknown' },
              ]}
            />
          </div>
        </div>
        <p className="small" style={{ margin: '6px 0' }}>
          {picked ? (
            <>
              So the robot must solve: <strong>{PROBLEM_LABEL[picked]}</strong>
            </>
          ) : (
            <span className="muted">Mark the pose and the map: the problem follows.</span>
          )}
        </p>
        <div className="slam-bar">
          <Button variant="primary" size="sm" disabled={!picked} onClick={check}>
            Check
          </Button>
          <Button size="sm" onClick={next}>
            Next card →
          </Button>
        </div>
        {mk.ok !== undefined && (
          <Callout kind={mk.ok ? 'ok' : 'bad'} title={mk.ok ? `Right: ${PROBLEM_LABEL[truth]}` : `Not quite: it is ${PROBLEM_LABEL[truth]}`}>
            <Rich text={`**Pose ${sc.pose === 'known' ? 'given' : 'unknown'}**${mk.pose && mk.pose !== sc.pose ? ' (you said ' + (mk.pose === 'known' ? 'given' : 'unknown') + ')' : ''}: ${sc.poseWhy}\n\n**Map ${sc.map === 'known' ? 'given' : 'unknown'}**${mk.map && mk.map !== sc.map ? ' (you said ' + (mk.map === 'known' ? 'given' : 'unknown') + ')' : ''}: ${sc.mapWhy}`} />
          </Callout>
        )}
        {mk.ok && truth === 'slam' && (
          <div className="slam-which-slam">
            <p className="small" style={{ margin: '8px 0 4px' }}>
              <strong>Online or full SLAM?</strong> Does it need its pose <em>now</em>, while moving, or the whole path, computed afterwards?
            </p>
            <div className="slam-bar">
              <Segmented
                size="sm"
                label="Online or full SLAM"
                value={mk.slam as SlamKind}
                onChange={(v) => set(sc.id, { slam: v as SlamKind, slamOk: (v as SlamKind) === sc.slam })}
                options={[
                  { value: 'online', label: 'online: current pose + map' },
                  { value: 'full', label: 'full: whole path + map' },
                ]}
              />
            </div>
            {mk.slam && (
              <Callout kind={mk.slamOk ? 'ok' : 'bad'} title={mk.slamOk ? `Right: ${sc.slam} SLAM` : `It is ${sc.slam} SLAM`}>
                <Rich
                  text={
                    sc.slam === 'online'
                      ? `It needs its current pose to keep moving, so it estimates $${POSTERIOR.online}$ as data arrive (e.g. EKF-SLAM or FastSLAM).`
                      : `The whole path is wanted and the data are processed together afterwards: $${POSTERIOR.full}$ (e.g. graph SLAM, which can still move old poses when a loop closes).`
                  }
                />
              </Callout>
            )}
          </div>
        )}
      </section>

      <section className="slam-panel slam-predicts">
        <h4>Predict, then check</h4>
        <PredictReveal
          id="slam-which-none"
          question="A factory arm knows its pose (encoders + forward kinematics) and the map (a CAD model of the cell). Which estimation problem must it solve?"
          options={['Localisation', 'Mapping', 'SLAM', 'None of these: it only needs to plan and control']}
          answer={3}
          explain="Nothing is unknown, so there is nothing to estimate: the top-left cell. Localisation, mapping and SLAM exist only because something is **not** given. (The same arm becomes a localisation problem the moment its base is put on a mobile robot without a map of where it is.)"
          tryIt="open the factory-arm card and mark both as given."
          onApply={() => show('arm', { pose: 'known', map: 'known', ok: true })}
        />
        <PredictReveal
          id="slam-which-full"
          question="Online SLAM or full SLAM: which one estimates **more** unknowns?"
          options={['Online SLAM', 'Full SLAM', 'The same: both estimate the pose and the map']}
          answer={1}
          explain={`Online SLAM keeps only the current pose, $${POSTERIOR.online}$; full SLAM keeps every pose along the trajectory, $${POSTERIOR.full}$. That is why graph SLAM (full) can move old poses when a loop closes, while a filter has already marginalised them away.`}
          tryIt="open the mine-survey card (processed overnight) and pick full SLAM."
          onApply={() => show('survey', { pose: 'unknown', map: 'unknown', ok: true, slam: 'full', slamOk: true })}
        />
      </section>

      <section className="slam-panel">
        <h4>Challenge: all eleven</h4>
        <Rich className="small" text={`Classify every card correctly, including online vs full for the SLAM ones. Now: **${nOk} / ${SCENARIOS.length}**.`} />
        {(challengeDone || doneAll) && (
          <Callout kind="ok" title="Challenge complete">
            <Rich text="Two questions decide it every time: how does the robot get its pose (GPS, motion capture, encoders = given), and does a map exist (floor plan, surveyed tags, CAD = given)?" />
          </Callout>
        )}
        <Button size="sm" variant="ghost" onClick={() => setMarks({})}>
          Reset all cards
        </Button>
      </section>
    </div>
  );

  return (
    <div className="slam-sim">
      <div className="slam-layout">
        {left}
        {right}
      </div>
      <More label="Notation (the course’s)">
        <Rich
          text={`- $x_t$ is the robot pose at time $t$, $x_{1:t}$ the whole trajectory, $m$ the map, $z_{1:t}$ the measurements and $u_{1:t}$ the controls (odometry).
- Localisation: $${POSTERIOR.localisation}$. Mapping (known poses): $${POSTERIOR.mapping}$.
- Online SLAM: $${POSTERIOR.online}$. Full SLAM: $${POSTERIOR.full}$.
- In every case, what sits **left** of the bar is estimated and what sits **right** of it is given.`}
        />
      </More>
    </div>
  );
}

/** p( unknowns | givens, z, u ): the student's marks as a posterior. */
function PosteriorBuilder({ pose, map, slam }: { pose?: Known; map?: Known; slam?: SlamKind }) {
  const xTok = slam === 'full' && pose === 'unknown' && map === 'unknown' ? 'x_{1:t}' : pose === 'known' && map === 'unknown' ? 'x_{1:t}' : 'x_t';
  const left: string[] = [];
  const right: string[] = [];
  if (pose === 'unknown') left.push(xTok);
  else if (pose === 'known') right.push(xTok);
  if (map === 'unknown') left.push('m');
  else if (map === 'known') right.push('m');
  const p = pose && map ? problemOf(pose, map) : null;
  const zu = p === 'mapping' ? 'z_{1:t}' : 'z_{1:t}, u_{1:t}';
  return (
    <div className="slam-which-post" aria-label="The posterior for your marks">
      <div className="slam-which-postrow">
        <span className="slam-which-pp">p(</span>
        <span className="slam-which-side is-est" title="Estimated: unknown">
          {left.length ? left.map((t) => <span key={t} className="slam-which-tok is-est"><TeX>{t}</TeX></span>) : <span className="slam-which-empty">{p === 'none' ? 'nothing' : '?'}</span>}
        </span>
        <span className="slam-which-bar">|</span>
        <span className="slam-which-side is-given" title="Given: known">
          {right.map((t) => (
            <span key={t} className="slam-which-tok is-given">
              <TeX>{t}</TeX>
            </span>
          ))}
          <span className="slam-which-tok is-data">
            <TeX>{zu}</TeX>
          </span>
        </span>
        <span className="slam-which-pp">)</span>
      </div>
      <div className="slam-which-postlab">
        <span>← estimated (unknown)</span>
        <span>given (known) →</span>
      </div>
    </div>
  );
}
