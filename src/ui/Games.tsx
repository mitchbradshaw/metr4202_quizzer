// "Which method would you use?" sorting and matching games.
import { useMemo, useState } from 'react';
import type { MatchGame, SortGame, TopicDef } from '../engine/types';
import { Rich } from './Rich';
import { Button, Callout } from './kit';
import { hashString, makeRng } from '../engine/rng';
import { recordAttempt } from '../app/store';
import { href } from '../app/router';

export function SortGameView({ game, topic, salt = 0 }: { game: SortGame; topic: TopicDef; salt?: number }) {
  const items = useMemo(() => makeRng(hashString(game.id) ^ salt).shuffle(game.items), [game, salt]);
  const [place, setPlace] = useState<Record<string, string>>({});
  const [sel, setSel] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const unplaced = items.filter((it) => !place[it.id]);
  const drop = (bucket: string, itemId: string | null) => {
    if (!itemId || checked) return;
    setPlace((p) => ({ ...p, [itemId]: bucket }));
    setSel(null);
  };
  const score = items.filter((it) => place[it.id] === it.bucket).length;
  const check = () => {
    setChecked(true);
    recordAttempt({
      topic: topic.code,
      kind: 'game',
      id: game.id,
      tier: 2,
      ok: score === items.length,
      title: game.title,
      href: href([topic.code, 'quiz'], { g: game.id }),
      note: `${score}/${items.length} sorted correctly`,
    });
  };
  return (
    <div className="game">
      <Rich text={game.prompt} />
      <p className="muted small">Pick a card, then pick its column (or drag it). Click a placed card to take it back.</p>
      <div className="pool" aria-label="Cards to sort">
        {unplaced.map((it) => (
          <button
            key={it.id}
            type="button"
            className={`chip-card ${sel === it.id ? 'is-picked' : ''}`}
            draggable
            onDragStart={(e) => e.dataTransfer.setData('text/plain', it.id)}
            onClick={() => setSel(sel === it.id ? null : it.id)}
            aria-pressed={sel === it.id}
          >
            <Rich text={it.text} inline />
          </button>
        ))}
        {!unplaced.length && !checked && <span className="muted small">All placed. Check when ready.</span>}
      </div>
      <div className="buckets" style={{ gridTemplateColumns: `repeat(${Math.min(game.buckets.length, 4)}, minmax(0, 1fr))` }}>
        {game.buckets.map((b) => (
          <div
            key={b.id}
            className={`bucket ${sel ? 'is-target' : ''}`}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => drop(b.id, e.dataTransfer.getData('text/plain'))}
          >
            <button type="button" className="bucket-head" onClick={() => drop(b.id, sel)} disabled={!sel || checked}>
              <Rich text={b.label} inline />
            </button>
            {items
              .filter((it) => place[it.id] === b.id)
              .map((it) => {
                const ok = it.bucket === b.id;
                return (
                  <div key={it.id} className={`chip-card is-placed ${checked ? (ok ? 'cell-ok' : 'cell-bad') : ''}`}>
                    <button type="button" className="chip-text" disabled={checked} onClick={() => setPlace(({ [it.id]: _, ...rest }) => rest)}>
                      <Rich text={it.text} inline />
                    </button>
                    {checked && (
                      <div className="chip-why">
                        {ok ? '✓ ' : `✗ belongs in “${game.buckets.find((x) => x.id === it.bucket)?.label.replace(/\$/g, '')}”. `}
                        <Rich text={it.why} inline />
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        ))}
      </div>
      {!checked ? (
        <Button variant="primary" onClick={check} disabled={unplaced.length > 0}>
          Check
        </Button>
      ) : (
        <Callout kind={score === items.length ? 'ok' : 'bad'} title={`${score} / ${items.length} correct`}>
          <Button
            size="sm"
            onClick={() => {
              setPlace({});
              setChecked(false);
            }}
          >
            Try again
          </Button>
        </Callout>
      )}
      {game.source && <p className="muted small">{game.source}</p>}
    </div>
  );
}

export function MatchGameView({ game, topic, salt = 0 }: { game: MatchGame; topic: TopicDef; salt?: number }) {
  const rights = useMemo(() => makeRng(hashString(game.id) ^ salt ^ 7).shuffle(game.pairs), [game, salt]);
  const [left, setLeft] = useState<string | null>(null);
  const [links, setLinks] = useState<Record<string, string>>({}); // leftId -> rightPairId
  const [checked, setChecked] = useState(false);
  const usedRight = new Set(Object.values(links));
  const score = game.pairs.filter((p) => links[p.id] === p.id).length;
  const check = () => {
    setChecked(true);
    recordAttempt({
      topic: topic.code,
      kind: 'game',
      id: game.id,
      tier: 2,
      ok: score === game.pairs.length,
      title: game.title,
      href: href([topic.code, 'quiz'], { g: game.id }),
      note: `${score}/${game.pairs.length} matched`,
    });
  };
  return (
    <div className="game">
      <Rich text={game.prompt} />
      <p className="muted small">Pick an item on the left, then its match on the right.</p>
      <div className="match">
        <div className="match-col">
          {game.pairs.map((p) => {
            const linked = links[p.id];
            const ok = checked ? linked === p.id : null;
            return (
              <button
                key={p.id}
                type="button"
                className={`chip-card ${left === p.id ? 'is-picked' : ''} ${linked ? 'is-linked' : ''} ${ok === null ? '' : ok ? 'cell-ok' : 'cell-bad'}`}
                onClick={() => !checked && setLeft(left === p.id ? null : p.id)}
              >
                {ok !== null && <span className={ok ? 'ok-text' : 'bad-text'}>{ok ? '✓ ' : '✗ '}</span>}
                <Rich text={p.left} inline />
                {linked && <span className="match-tag">→ {rights.findIndex((r) => r.id === linked) + 1}</span>}
              </button>
            );
          })}
        </div>
        <div className="match-col">
          {rights.map((r, i) => (
            <button
              key={r.id}
              type="button"
              className={`chip-card ${usedRight.has(r.id) ? 'is-linked' : ''}`}
              disabled={checked || !left}
              onClick={() => {
                if (!left) return;
                setLinks((l) => {
                  const next = Object.fromEntries(Object.entries(l).filter(([, v]) => v !== r.id));
                  next[left] = r.id;
                  return next;
                });
                setLeft(null);
              }}
            >
              <span className="match-num">{i + 1}</span> <Rich text={r.right} inline />
            </button>
          ))}
        </div>
      </div>
      {!checked ? (
        <Button variant="primary" onClick={check} disabled={Object.keys(links).length < game.pairs.length}>
          Check matches
        </Button>
      ) : (
        <Callout kind={score === game.pairs.length ? 'ok' : 'bad'} title={`${score} / ${game.pairs.length} correct`}>
          <ul>
            {game.pairs.map((p) => (
              <li key={p.id}>
                <Rich text={p.left} inline /> → <Rich text={p.right} inline />
                {p.why && (
                  <span className="muted">
                    {' '}
                    — <Rich text={p.why} inline />
                  </span>
                )}
              </li>
            ))}
          </ul>
          <Button
            size="sm"
            onClick={() => {
              setLinks({});
              setChecked(false);
            }}
          >
            Try again
          </Button>
        </Callout>
      )}
      {game.source && <p className="muted small">{game.source}</p>}
    </div>
  );
}
