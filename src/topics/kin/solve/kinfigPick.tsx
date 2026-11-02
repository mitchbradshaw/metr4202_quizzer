// A compact direction picker for the kinematics exam-mode generators: "which way does x̂_b point?", "which is ω_2?".
// The six axis directions are shown as a small grid in a fixed, logical order (+x̂ −x̂ / +ŷ −ŷ / +ẑ −ẑ), so the
// student reads them like a compass instead of hunting through a shuffled, full-width list. After checking, the
// feedback explains the picked option and, if it was wrong, the right one (each option keeps its own "why").
import type { ComponentType } from 'react';
import type { CustomPart, CustomPartProps } from '../../../engine/types';
import { Button, Callout } from '../../../ui/kit';
import { Rich } from '../../../ui/Rich';
import { usePersisted } from '../../../ui/persist';
import './kinfig.css';

export interface PickOption {
  text: string;
  correct: boolean;
  why: string;
  /** A named slip (src/engine/traps.ts or kinfigTraps.ts) to log when this wrong option is picked. */
  trapId?: string;
}

/** What the self-tests read: the options as a plain choice (exactly one correct). */
export interface PickSpec {
  options: PickOption[];
  cols: number;
  /** Column width in px (fixed, so the grid does not jump when the feedback appears). */
  colWidth: number;
}

export type PickPart = CustomPart & { pick: PickSpec };

function makePick(spec: PickSpec): ComponentType<CustomPartProps> {
  function KinPick({ onResult, pkey, disabled }: CustomPartProps) {
    const [sel, setSel] = usePersisted<number | null>(`${pkey}:pick`, null);
    const [done, setDone] = usePersisted<boolean>(`${pkey}:picked`, false);
    const key = spec.options.findIndex((o) => o.correct);
    const check = () => {
      if (sel === null) return;
      setDone(true);
      const o = spec.options[sel];
      onResult({ correct: o.correct, trapId: o.correct ? undefined : o.trapId });
    };
    const picked = sel === null ? null : spec.options[sel];
    return (
      <div className="kin-pick-wrap">
        <div className="kin-pick" role="radiogroup" style={{ gridTemplateColumns: `repeat(${spec.cols}, ${spec.colWidth}px)` }}>
          {spec.options.map((o, i) => {
            const on = sel === i;
            const st = done ? (o.correct ? 'is-right' : on ? 'is-wrong' : 'is-dim') : on ? 'is-picked' : '';
            return (
              <button key={i} type="button" role="radio" aria-checked={on} className={`kin-pick-opt ${st}`} disabled={disabled || done} onClick={() => setSel(i)}>
                <span className="kin-pick-mark" aria-hidden="true">
                  {done ? (o.correct ? '✓' : on ? '✗' : '') : on ? '●' : ''}
                </span>
                <Rich text={o.text} inline />
              </button>
            );
          })}
        </div>
        {!done && (
          <Button variant="primary" onClick={check} disabled={disabled || sel === null}>
            Check
          </Button>
        )}
        {done && picked && (
          <Callout kind={picked.correct ? 'ok' : 'bad'} title={picked.correct ? 'Correct' : 'Not quite'}>
            <div className="kin-pick-why">
              <Rich text={picked.why} inline />
            </div>
            {!picked.correct && key >= 0 && (
              <div className="kin-pick-why">
                <strong>Answer: </strong>
                <Rich text={spec.options[key].text} inline />. <Rich text={spec.options[key].why} inline />
              </div>
            )}
          </Callout>
        )}
      </div>
    );
  }
  return KinPick;
}

/** A direction (or other short-option) question drawn as a compact grid, in the given order. */
export function pickPart(o: { id: string; label: string; marks: number; options: PickOption[]; cols?: number; colWidth?: number }): PickPart {
  const spec: PickSpec = { options: o.options, cols: o.cols ?? 2, colWidth: o.colWidth ?? 128 };
  return { kind: 'custom', id: o.id, label: o.label, marks: o.marks, render: makePick(spec), pick: spec };
}
