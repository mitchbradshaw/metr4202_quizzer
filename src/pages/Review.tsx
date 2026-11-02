// Mixed review: due flashcards across all topics, then a short set from the weakest topics.
import { useMemo, useState } from 'react';
import { TOPICS, challengeIds } from '../topics';
import { mastery, useProgress } from '../app/store';
import { Flashcards } from '../ui/Flashcards';
import { ItemRunner, type RunItem } from './ItemRunner';
import { Button, Segmented } from '../ui/kit';
import { freshSeed, makeRng } from '../engine/rng';
import type { Tier } from '../engine/types';

export function Review() {
  const p = useProgress();
  const [view, setView] = useState<'cards' | 'weak'>('cards');
  const [round, setRound] = useState(0);
  const cards = useMemo(() => TOPICS.flatMap((t) => t.flashcards.map((c) => ({ ...c, topic: `${t.code} ${t.short}` }))), []);
  const weakest = useMemo(
    () =>
      TOPICS.filter((t) => t.mcqs.length || t.solve.length)
        .map((t) => ({ t, m: mastery(p, t.code, challengeIds(t)).value }))
        .sort((a, b) => a.m - b.m)
        .slice(0, 4),
    // Only re-pick when a new round starts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [round]
  );
  const items = useMemo<RunItem[]>(() => {
    const rng = makeRng(freshSeed());
    const out: RunItem[] = [];
    for (const { t } of weakest) {
      const mcqs = rng.shuffle(t.mcqs).slice(0, 1);
      for (const mcq of mcqs) out.push({ kind: 'mcq', topic: t, mcq, marks: 1 });
      const gens = rng.shuffle(t.solve.filter((g) => g.sprint !== false)).slice(0, 1);
      for (const gen of gens) {
        const tier: Tier = gen.tiers.includes(2) ? 2 : gen.tiers[0];
        out.push({ kind: 'solve', topic: t, gen, tier, seed: 100000 + Math.floor(rng.next() * 900000), marks: 1 });
      }
    }
    return out;
  }, [weakest]);

  return (
    <div className="stack">
      <h1>Mixed review</h1>
      <Segmented
        label="Review part"
        value={view}
        onChange={setView}
        options={[
          { value: 'cards', label: 'Due flashcards' },
          {
            value: 'weak',
            label: Object.keys(p.attempts).length
              ? `Weakest topics (${weakest.map((w) => w.t.code).join(', ')})`
              : `Weak spots (no attempts yet: starting with ${weakest.map((w) => w.t.code).join(', ')})`,
          },
        ]}
      />
      {view === 'cards' ? (
        <Flashcards cards={cards} title="All topics" origin="mixed" newLimit={15} />
      ) : (
        <>
          <ItemRunner key={round} items={items} title="Weak-spot set" />
          <Button onClick={() => setRound((r) => r + 1)}>New weak-spot set</Button>
        </>
      )}
    </div>
  );
}
