// React pieces for the plan-astar generator: the instance's figure and the exam step table (a custom part).
// The checking itself is the pure judgePop / expectedEntries / judgeEntry in astarTable.ts (self-tested).
import type { ComponentType } from 'react';
import type { CustomPartProps } from '../../../engine/types';
import { evaluate } from '../../../engine/expr';
import { usePersisted } from '../../../ui/persist';
import { Button, Callout } from '../../../ui/kit';
import { Rich } from '../../../ui/Rich';
import { RoadGraph } from './astarGraph';
import type { MapDef } from './astarMaps';
import { ClosedTable, OpenTable } from './astarTables';
import { expectedEntries, judgeEntry, judgePop, num, type ExamTrace, type NameOf, type PopVerdict } from './astarTable';
import '../astar.css';

/** The road map of one problem (no search state), with h printed beside each town. */
export function makeAStarFigure(map: MapDef, start: string, goal: string, h: Record<string, number>, caption?: string): ComponentType {
  const hOf = (n: string) => h[n];
  function AStarFigure() {
    return (
      <figure style={{ margin: 0 }}>
        <RoadGraph map={map} start={start} goal={goal} h={hOf} showValues={false} figure ariaLabel={`Road map from ${map.name(start)} to ${map.name(goal)} with road lengths in ${map.unit} and h beside each town`} />
        <figcaption className="muted small">{caption ?? `Road lengths in ${map.unit}; h = straight-line distance to ${map.name(goal)} (also in the table).`}</figcaption>
      </figure>
    );
  }
  return AStarFigure;
}

interface StepAns {
  pick: string | null;
  tries: number;
  firstTrap?: string;
  lastMsg?: string;
  vals: Record<string, string>;
  results: Record<string, { ok: boolean; message: string }> | null;
  revealed: boolean;
  done: boolean;
}

interface PartState {
  steps: StepAns[];
  reported: boolean;
}

const freshStep = (): StepAns => ({ pick: null, tries: 0, vals: {}, results: null, revealed: false, done: false });

/** Was this step right first time (pop and every value)? */
export function stepClean(a: { tries: number; revealed: boolean; results: Record<string, { ok: boolean }> | null }): boolean {
  return a.tries === 0 && !a.revealed && (!a.results || Object.values(a.results).every((r) => r.ok));
}

/**
 * The exam's step table as an answer: for each step pick the town popped, then type f for every neighbour
 * not in Closed (its entry in Open after the step). Each step is checked once when submitted; the official
 * tables then appear so a slip does not carry forward. Reports one result when the goal has been popped.
 */
export function makeAStarTablePart(t: ExamTrace, name: NameOf): ComponentType<CustomPartProps> {
  const steps = t.steps;
  function AStarTablePart({ onResult, pkey, disabled }: CustomPartProps) {
    const [s, setS] = usePersisted<PartState>(`${pkey}:x`, () => ({ steps: steps.map(freshStep), reported: false }));
    const active = s.steps.findIndex((x) => !x.done);
    const allDone = active === -1;

    const update = (j: number, a: StepAns) => {
      const nextSteps = s.steps.map((x, k) => (k === j ? a : x));
      const finished = nextSteps.every((x) => x.done);
      const next: PartState = { steps: nextSteps, reported: s.reported || finished };
      setS(next);
      if (finished && !s.reported) {
        const clean = nextSteps.every(stepClean);
        const trap = nextSteps.find((x) => x.firstTrap)?.firstTrap;
        onResult({ correct: clean, trapId: clean ? undefined : trap });
      }
    };

    const pick = (j: number, node: string) => {
      const a = s.steps[j];
      const step = steps[j];
      const v: PopVerdict = judgePop(step, node, 'astar', name, t.goal);
      if (!v.ok) {
        update(j, { ...a, tries: a.tries + 1, lastMsg: v.message, firstTrap: a.firstTrap ?? (v.trap ? `plan-astar-${v.trap}` : undefined) });
        return;
      }
      const entries = expectedEntries(step, 'astar', name);
      update(j, { ...a, pick: step.popped, lastMsg: v.message, done: step.isGoal || entries.length === 0 });
    };

    const check = (j: number) => {
      const a = s.steps[j];
      const step = steps[j];
      const res: Record<string, { ok: boolean; message: string }> = {};
      let trap: string | undefined;
      for (const e of expectedEntries(step, 'astar', name)) {
        const typed = evaluate(a.vals[e.node] ?? '');
        const r = judgeEntry(e, typed, 'astar', name);
        res[e.node] = r;
        if (!r.ok && !trap && Number.isFinite(e.wrongValue) && Math.abs(typed - e.wrongValue) <= Math.max(0.01 * Math.abs(e.wrongValue), 0.05))
          trap = e.kind === 'worse' ? 'plan-astar-worse-route' : 'plan-astar-missed-improve';
      }
      update(j, { ...a, results: res, done: true, firstTrap: a.firstTrap ?? trap });
    };

    const reveal = (j: number) => {
      const a = s.steps[j];
      const step = steps[j];
      const vals: Record<string, string> = {};
      const res: Record<string, { ok: boolean; message: string }> = {};
      for (const e of expectedEntries(step, 'astar', name)) {
        vals[e.node] = num(e.value);
        res[e.node] = { ok: true, message: `${name(e.node)}: ${e.explain}` };
      }
      update(j, { ...a, pick: step.popped, vals, results: res, revealed: true, done: true });
    };

    const shownUpTo = allDone ? steps.length - 1 : active;
    const r0 = t.initial[0];
    const cleanCount = s.steps.filter((x) => x.done && stepClean(x)).length;
    return (
      <div className="plan-astar-part">
        <Rich
          className="small"
          text={`**Start.** Open = {${name(t.start)}: $0 + ${num(r0?.h ?? 0)} = ${num(r0?.f ?? 0)}$}, parent –. Closed is empty.`}
        />
        {steps.slice(0, shownUpTo + 1).map((step, j) => {
          const a = s.steps[j];
          const entries = a.pick ? expectedEntries(step, 'astar', name) : [];
          const order = step.before.slice().sort((x, y) => x.seq - y.seq);
          const clean = a.done && stepClean(a);
          return (
            <section key={j} className={`plan-astar-step${a.done ? ' is-done' : ''}`} aria-label={`Step ${step.k}`}>
              <div className="plan-astar-row">
                <span className="plan-astar-step-title">Step {step.k}</span>
                {a.done && <span className={clean ? 'ok-text' : 'bad-text'}>{clean ? '✓ right first time' : a.revealed ? 'revealed' : '✗ see the notes'}</span>}
              </div>
              {!a.pick ? (
                <>
                  <div className="small">Which town is popped from Open?</div>
                  <div className="plan-astar-picks" role="group" aria-label={`Step ${step.k}: town popped`}>
                    {order.map((r) => (
                      <button key={r.node} type="button" className="plan-astar-pick" disabled={disabled} onClick={() => pick(j, r.node)}>
                        {name(r.node)}
                      </button>
                    ))}
                  </div>
                  {a.lastMsg && (
                    <Callout kind="bad" title="Not that one">
                      <Rich text={a.lastMsg} />
                    </Callout>
                  )}
                </>
              ) : (
                <Rich
                  className="small"
                  text={`Popped: **${name(a.pick)}** ($f = ${num(step.row.g)} + ${num(step.row.h)} = ${num(step.row.f)}$)${step.isGoal ? ': the goal, so the search **stops**.' : `, moved to Closed with $g = ${num(step.row.g)}$.`}${a.tries ? ` (after ${a.tries} wrong ${a.tries === 1 ? 'try' : 'tries'})` : ''}`}
                />
              )}
              {a.pick && entries.length > 0 && (
                <div className="plan-astar-entries">
                  {!a.done && <div className="small">For each neighbour of {name(step.popped)} not in Closed, type its $f$ in Open after this step (unchanged if the new route is not cheaper):</div>}
                  {entries.map((e) => {
                    const r = a.results?.[e.node];
                    return (
                      <div key={e.node} className="plan-astar-entry">
                        <label htmlFor={`${pkey}-${j}-${e.node}`}>f({name(e.node)})</label>
                        <input
                          id={`${pkey}-${j}-${e.node}`}
                          className={`plan-astar-in${r ? (r.ok ? ' is-ok' : ' is-bad') : ''}`}
                          inputMode="decimal"
                          autoComplete="off"
                          value={a.vals[e.node] ?? ''}
                          disabled={disabled || a.done}
                          onChange={(ev) => update(j, { ...a, vals: { ...a.vals, [e.node]: ev.target.value } })}
                          onKeyDown={(ev) => ev.key === 'Enter' && !a.done && entries.every((x) => (a.vals[x.node] ?? '').trim()) && check(j)}
                        />
                        <span className="muted small">h = {num(e.h)}</span>
                        {r && !r.ok && <Rich className="plan-astar-msg is-bad" text={r.message} />}
                      </div>
                    );
                  })}
                  {!a.done && (
                    <div className="plan-astar-row">
                      <Button variant="primary" disabled={disabled || entries.some((e) => !(a.vals[e.node] ?? '').trim())} onClick={() => check(j)}>
                        Check step {step.k}
                      </Button>
                    </div>
                  )}
                </div>
              )}
              {!a.done && (
                <div className="plan-astar-row">
                  <Button size="sm" variant="ghost" disabled={disabled} onClick={() => reveal(j)}>
                    Reveal step {step.k}
                  </Button>
                </div>
              )}
              {a.done && (
                <div className="plan-astar-steptables">
                  <OpenTable rows={step.open} algo="astar" name={name} showNext={false} />
                  <ClosedTable rows={step.closed} name={name} just={step.popped} />
                </div>
              )}
            </section>
          );
        })}
        {allDone && (
          <Callout kind={cleanCount === steps.length ? 'ok' : 'note'} title={`Goal ${name(t.goal)} popped at step ${steps.length}: the search stops`}>
            <p>
              Steps right first time: {cleanCount} / {steps.length}. Now trace the parents back from {name(t.goal)} for the route.
            </p>
          </Callout>
        )}
      </div>
    );
  }
  // The reference run rides along so the self-test can feed it back through the same checkers.
  return Object.assign(AStarTablePart, { examTrace: t, nameOf: name });
}

/** Reference data attached to a table part made by makeAStarTablePart (for self-tests). */
export function tablePartData(render: unknown): { examTrace: ExamTrace; nameOf: NameOf } | null {
  const r = render as { examTrace?: ExamTrace; nameOf?: NameOf };
  return r && r.examTrace && r.nameOf ? { examTrace: r.examTrace, nameOf: r.nameOf } : null;
}
