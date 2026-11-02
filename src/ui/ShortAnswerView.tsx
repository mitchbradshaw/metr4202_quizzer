// Word-limited short answer (A3 style), self-marked against key points.
import { useState } from 'react';
import type { ShortAnswer, TopicDef } from '../engine/types';
import { Rich } from './Rich';
import { Button, Callout } from './kit';
import { recordAttempt } from '../app/store';
import { href } from '../app/router';

export function ShortAnswerView({ sa, topic, onMarked }: { sa: ShortAnswer; topic: TopicDef; onMarked?: (got: number, of: number) => void }) {
  const [text, setText] = useState('');
  const [shown, setShown] = useState(false);
  const [ticks, setTicks] = useState<boolean[]>(() => sa.keyPoints.map(() => false));
  const [marked, setMarked] = useState(false);
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  const over = sa.wordLimit !== undefined && words > sa.wordLimit;
  const mark = () => {
    const got = ticks.filter(Boolean).length;
    setMarked(true);
    recordAttempt({
      topic: topic.code,
      kind: 'short',
      id: sa.id,
      tier: 2,
      ok: got >= Math.ceil(sa.keyPoints.length * 0.6) && !over,
      title: `Short answer: ${sa.prompt.replace(/\$[^$]*\$/g, '…').slice(0, 60)}`,
      href: href([topic.code, 'quiz'], { sa: sa.id }),
      note: `${got}/${sa.keyPoints.length} key points${over ? ', over the word limit' : ''}`,
    });
    onMarked?.(got, sa.keyPoints.length);
  };
  return (
    <div className="short">
      <Rich text={sa.prompt} />
      <textarea className="short-text" rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder="Key fact and reason first." aria-label="Your answer" />
      <div className={`muted small ${over ? 'bad-text' : ''}`}>
        {words} word{words === 1 ? '' : 's'}
        {sa.wordLimit ? ` / ${sa.wordLimit} limit` : ''}
      </div>
      {!shown ? (
        <Button variant="primary" onClick={() => setShown(true)} disabled={!text.trim()}>
          Compare with the model answer
        </Button>
      ) : (
        <>
          <Callout kind="info" title="Model answer">
            <Rich text={sa.model} />
          </Callout>
          <div className="keypoints">
            <div className="muted small">Tick the key points your answer made:</div>
            {sa.keyPoints.map((k, i) => (
              <label key={i} className="kp">
                <input type="checkbox" checked={ticks[i]} disabled={marked} onChange={(e) => setTicks((t) => t.map((x, j) => (j === i ? e.target.checked : x)))} />
                <Rich text={k} inline />
              </label>
            ))}
          </div>
          {!marked ? (
            <Button onClick={mark}>Record my mark</Button>
          ) : (
            <Callout kind="note">
              Recorded {ticks.filter(Boolean).length}/{sa.keyPoints.length} key points.
            </Callout>
          )}
        </>
      )}
      <p className="muted small">{sa.source}</p>
    </div>
  );
}
