// Predict-then-reveal: commit to a prediction, then see it in the simulation.
import { useMemo, useState } from 'react';
import { hashString, makeRng } from '../engine/rng';
import { Rich } from './Rich';
import { Button, Callout } from './kit';
import { recordPrediction } from '../app/store';

export interface PredictRevealProps {
  id: string;
  question: string;
  options: string[];
  /** Index of the correct option. */
  answer: number;
  explain: string;
  /** What to do in the sim to check, e.g. "Drag k₂ to twice its value and watch ω₂." */
  tryIt?: string;
  /** Applies the change in the simulation ("Show me"). */
  onApply?: () => void;
  /** Keep the written option order (e.g. options that are ordered numbers). Default: a shuffle seeded by id. */
  fixedOrder?: boolean;
}

export function PredictReveal({ id, question, options, answer, explain, tryIt, onApply, fixedOrder }: PredictRevealProps) {
  // Display order is a stable shuffle seeded by the prompt id, so the answer is not always where it was written.
  const order = useMemo(
    () => (fixedOrder ? options.map((_, i) => i) : makeRng(hashString(id)).shuffle(options.map((_, i) => i))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [id, options.length, fixedOrder]
  );
  const [pick, setPick] = useState<number | null>(null);
  const [locked, setLocked] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const reveal = () => {
    if (revealed) return;
    setRevealed(true);
    recordPrediction(id, pick === answer);
  };
  return (
    <div className="predict" aria-live="polite">
      <div className="predict-tag">Predict, then check</div>
      <Rich text={question} />
      <div className="predict-options" role="radiogroup" aria-label="Your prediction">
        {order.map((i) => {
          const o = options[i];
          const state = revealed ? (i === answer ? 'is-right' : i === pick ? 'is-wrong' : '') : i === pick ? 'is-picked' : '';
          return (
            <button
              key={i}
              type="button"
              role="radio"
              aria-checked={pick === i}
              disabled={locked}
              className={`predict-opt ${state}`}
              onClick={() => setPick(i)}
            >
              <Rich text={o} inline />
            </button>
          );
        })}
      </div>
      {!locked ? (
        <Button variant="primary" size="sm" disabled={pick === null} onClick={() => setLocked(true)}>
          Lock in prediction
        </Button>
      ) : !revealed ? (
        <div className="predict-next">
          {tryIt && <Rich text={`**Now check it:** ${tryIt}`} />}
          <div className="row gap-s">
            {onApply && (
              <Button
                size="sm"
                variant="primary"
                onClick={() => {
                  onApply();
                  reveal();
                }}
              >
                Show me
              </Button>
            )}
            <Button size="sm" onClick={reveal}>
              Reveal answer
            </Button>
          </div>
        </div>
      ) : (
        <Callout kind={pick === answer ? 'ok' : 'bad'} title={pick === answer ? 'Your prediction was right' : 'Not what happens'}>
          <Rich text={explain} />
        </Callout>
      )}
    </div>
  );
}
