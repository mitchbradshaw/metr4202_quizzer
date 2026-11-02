// Leitner flashcards. Space flips; 1 = missed, 2 = got it.
import { useEffect, useMemo, useState } from 'react';
import type { Flashcard } from '../engine/types';
import { Rich } from './Rich';
import { Button, Kbd, ProgressBar } from './kit';
import { boxCounts, dueCards, reviewFlash, useProgress } from '../app/store';

export function Flashcards({
  cards,
  title = 'Flashcards',
  origin,
  newLimit = Infinity,
}: {
  cards: (Flashcard & { topic?: string })[];
  title?: string;
  origin?: string;
  /** Most never-seen cards to introduce per session. */
  newLimit?: number;
}) {
  const progress = useProgress();
  // Freeze the queue when the session starts so cards don't jump around while answering.
  const [queue, setQueue] = useState<Flashcard[]>(() => dueCards(progress, cards, newLimit));
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [stats, setStats] = useState({ ok: 0, miss: 0 });
  const counts = useMemo(() => boxCounts(progress, cards), [progress, cards]);
  const card = queue[idx];

  useEffect(() => {
    setQueue(dueCards(progress, cards, newLimit));
    setIdx(0);
    setFlipped(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards]);

  const answer = (ok: boolean) => {
    if (!card) return;
    reviewFlash(card.id, ok);
    setStats((s) => (ok ? { ...s, ok: s.ok + 1 } : { ...s, miss: s.miss + 1 }));
    // Missed cards come back at the end of this session (box 1 is due again today).
    if (!ok) setQueue((q) => [...q, card]);
    setIdx((i) => i + 1);
    setFlipped(false);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (!card) return;
      if (e.key === ' ') {
        e.preventDefault();
        setFlipped((f) => !f);
      } else if (flipped && e.key === '1') answer(false);
      else if (flipped && e.key === '2') answer(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div className="flash">
      <div className="flash-head">
        <h3>{title}</h3>
        <div className="boxes" title="Leitner boxes: new, then boxes 1–5 (reviewed after 0, 1, 3, 7, 14 days)">
          <span className="box box-0">new {counts[0]}</span>
          {[1, 2, 3, 4, 5].map((b) => (
            <span key={b} className={`box box-${b}`}>
              {b}: {counts[b]}
            </span>
          ))}
        </div>
      </div>
      {card ? (
        <>
          <ProgressBar value={idx} max={queue.length} label="Cards reviewed" />
          <button type="button" className={`flashcard ${flipped ? 'is-flipped' : ''}`} onClick={() => setFlipped((f) => !f)} aria-label={flipped ? 'Answer side; click to flip back' : 'Question side; click to show the answer'}>
            <div className="flash-side">
              {origin && (card as { topic?: string }).topic && <span className="muted small">{(card as { topic?: string }).topic}</span>}
              <Rich text={flipped ? card.back : card.front} />
            </div>
          </button>
          {!flipped ? (
            <div className="row gap-s">
              <Button variant="primary" onClick={() => setFlipped(true)}>
                Show answer
              </Button>
              <span className="muted small">
                <Kbd>Space</Kbd> flips
              </span>
            </div>
          ) : (
            <div className="row gap-s">
              <Button variant="danger" onClick={() => answer(false)}>
                Missed it <Kbd>1</Kbd>
              </Button>
              <Button variant="ok" onClick={() => answer(true)}>
                Got it <Kbd>2</Kbd>
              </Button>
            </div>
          )}
        </>
      ) : (
        <div className="empty row gap-s wrap">
          <p>
            {queue.length ? `Session done: ${stats.ok} right, ${stats.miss} missed.` : 'No cards due right now.'} Cards you got right come back after 1, 3, 7 and 14 days.
            {counts[0] > 0 && ` ${counts[0]} card${counts[0] === 1 ? '' : 's'} not seen yet.`}
          </p>
          {counts[0] > 0 && (
            <Button
              variant="primary"
              onClick={() => {
                setQueue(dueCards(progress, cards, Number.isFinite(newLimit) ? newLimit : 20));
                setIdx(0);
                setStats({ ok: 0, miss: 0 });
              }}
            >
              Learn new cards
            </Button>
          )}
          <Button
            onClick={() => {
              setQueue(cards.slice().sort(() => Math.random() - 0.5));
              setIdx(0);
              setStats({ ok: 0, miss: 0 });
            }}
          >
            Practise all {cards.length} anyway
          </Button>
        </div>
      )}
    </div>
  );
}
