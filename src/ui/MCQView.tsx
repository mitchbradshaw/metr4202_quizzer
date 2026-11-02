// One multiple-choice question with an explanation for every option.
import { useMemo, useRef, type KeyboardEvent } from 'react';
import { usePersisted } from './persist';
import type { MCQ, TopicDef } from '../engine/types';
import { Rich } from './Rich';
import { Badge, Button, Callout } from './kit';
import { hashString, makeRng } from '../engine/rng';
import { recordAttempt } from '../app/store';
import { href } from '../app/router';
import { trapById } from '../engine/traps';

/** Citation shown after answering; answer letters refer to the paper's (unshuffled) options, so drop them. */
function cleanSource(src: string): string {
  return src.replace(/[;,]?\s*\(?\b(official )?answers?:?\s*\(?[a-h]\)?(?![a-z])\)?/gi, '').trim();
}

export const STYLE_PROMPT: Record<MCQ['style'], string> = {
  correct: 'Which statement is correct?',
  incorrect: 'Which one is FALSE (or does NOT apply)?',
  'most-correct': 'Choose the MOST correct answer.',
  value: 'Choose the correct value.',
  best: 'Choose the best option.',
};

export function MCQView({
  mcq,
  topic,
  salt = 0,
  exam,
  onAnswered,
  persistKey = '',
}: {
  mcq: MCQ;
  topic: TopicDef;
  /** Changes the option shuffle between sessions. */
  salt?: number;
  exam?: boolean;
  onAnswered?: (ok: boolean) => void;
  /** Extra key for remembering the chosen option across remounts (e.g. a sprint item index). */
  persistKey?: string;
}) {
  const order = useMemo(
    () => (mcq.fixedOrder ? mcq.options.map((_, i) => i) : makeRng(hashString(mcq.id) ^ salt).shuffle(mcq.options.map((_, i) => i))),
    [mcq, salt]
  );
  const pk = `mcq|${mcq.id}|${salt}|${persistKey}`;
  const [pick, setPick] = usePersisted<number | null>(`${pk}:pick`, null);
  const [done, setDone] = usePersisted<boolean>(`${pk}:done`, false);
  const optRefs = useRef<(HTMLButtonElement | null)[]>([]);
  // Radio-group keyboard behaviour: arrows move the selection, Enter checks.
  const onOptKey = (pos: number) => (e: KeyboardEvent<HTMLButtonElement>) => {
    if (done) return;
    const n = order.length;
    let to = -1;
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') to = (pos + 1) % n;
    else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') to = (pos - 1 + n) % n;
    else if (e.key === 'Enter') {
      e.preventDefault();
      if (pick === null) setPick(order[pos]);
      else check();
      return;
    } else return;
    e.preventDefault();
    setPick(order[to]);
    optRefs.current[to]?.focus();
  };
  const letters = 'abcdefgh';
  const check = () => {
    if (pick === null || done) return;
    setDone(true);
    const ok = mcq.options[pick].correct;
    recordAttempt({
      topic: topic.code,
      kind: 'quiz',
      id: mcq.id,
      tier: mcq.difficulty ?? 2,
      ok,
      trapId: ok ? undefined : mcq.trapId,
      title: `Quiz: ${mcq.stem.replace(/\$[^$]*\$/g, '…').slice(0, 70)}`,
      href: href([topic.code, 'quiz'], { q: mcq.id }),
      note: !ok && mcq.trapId ? trapById(mcq.trapId)?.title : undefined,
    });
    onAnswered?.(ok);
  };
  const correctIdx = mcq.options.findIndex((o) => o.correct);
  return (
    <div className="mcq">
      <div className="mcq-instr">
        <span className={mcq.style === 'incorrect' ? 'instr-alert' : ''}>{STYLE_PROMPT[mcq.style]}</span>
      </div>
      <Rich text={mcq.stem} />
      <div className="options" role="radiogroup" aria-label="Options">
        {order.map((i, pos) => {
          const o = mcq.options[i];
          const st = done ? (o.correct ? 'is-right' : i === pick ? 'is-wrong' : '') : i === pick ? 'is-picked' : '';
          return (
            <button
              key={i}
              type="button"
              role="radio"
              aria-checked={pick === i}
              tabIndex={(pick === null ? pos === 0 : i === pick) ? 0 : -1}
              ref={(el) => (optRefs.current[pos] = el)}
              onKeyDown={onOptKey(pos)}
              className={`option ${st}`}
              onClick={() => !done && setPick(i)}
            >
              <span className="option-mark" aria-hidden="true">
                {done ? (o.correct ? '✓' : i === pick ? '✗' : letters[pos]) : letters[pos]}
              </span>
              <span className="option-body">
                <Rich text={o.text} inline />
                {done && (
                  <span className="option-why">
                    <Rich text={o.why} inline />
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>
      {!done ? (
        <Button variant="primary" onClick={check} disabled={pick === null}>
          Check answer
        </Button>
      ) : (
        <Callout
          kind={pick !== null && mcq.options[pick].correct ? 'ok' : 'bad'}
          title={pick !== null && mcq.options[pick].correct ? 'Correct' : `The answer is (${letters[order.indexOf(correctIdx)]})`}
        >
          {!exam && mcq.trapId && pick !== null && !mcq.options[pick].correct && (
            <p>
              <Badge tone="warn">Trap</Badge> {trapById(mcq.trapId)?.title}
            </p>
          )}
          <span className="muted small">
            Every option is explained above. {cleanSource(mcq.source)}
          </span>
        </Callout>
      )}
    </div>
  );
}
