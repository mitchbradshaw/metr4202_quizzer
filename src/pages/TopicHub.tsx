// A topic's hub: Learn / Explore / Solve / Quiz tabs, all addressable by hash route.
import { useEffect, useMemo, useState } from 'react';
import type { Route } from '../app/router';
import { go, href, replace } from '../app/router';
import type { Tier, TopicDef } from '../engine/types';
import { challengeIds, neighbours } from '../topics';
import { itemPriority, mastery, useProgress } from '../app/store';
import { Badge, Button, Callout, LinkButton, MasteryRing, Segmented } from '../ui/kit';
import { Rich } from '../ui/Rich';
import { ConceptCardView } from '../ui/ConceptCardView';
import { Flashcards } from '../ui/Flashcards';
import { SolveRunner, TIER_LABEL } from '../ui/SolveRunner';
import { MCQView } from '../ui/MCQView';
import { MatchGameView, SortGameView } from '../ui/Games';
import { ShortAnswerView } from '../ui/ShortAnswerView';
import { freshSeed } from '../engine/rng';
import { PART_TITLES } from '../engine/codes';

const TABS = [
  { id: 'learn', label: 'Learn' },
  { id: 'explore', label: 'Explore' },
  { id: 'solve', label: 'Solve' },
  { id: 'quiz', label: 'Quiz' },
] as const;

export function TopicHub({ topic, route }: { topic: TopicDef; route: Route }) {
  const tab = (route.parts[1] || 'learn') as (typeof TABS)[number]['id'];
  const item = route.parts[2];
  const p = useProgress();
  const m = mastery(p, topic.code, challengeIds(topic));
  const [prev, next] = neighbours(topic.code);

  return (
    <div className="hub">
      <nav className="crumbs" aria-label="Breadcrumb">
        <a href="#/">Home</a> <span>/</span> <span>{PART_TITLES[topic.part]}</span>
      </nav>
      <header className="hub-head">
        <div className="hub-title">
          <span className="hub-code">§{topic.num}</span>
          <div>
            <h1>{topic.title}</h1>
            <div className="row gap-s wrap">
              <Badge>{topic.lectures}</Badge>
              {topic.exam && <Badge tone="accent">{topic.exam}</Badge>}
            </div>
          </div>
        </div>
        <MasteryRing value={m.value} n={m.n} size={54} />
      </header>
      <nav className="tabs" role="tablist" aria-label="Topic sections">
        {TABS.map((t) => (
          <a
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            tabIndex={tab === t.id ? 0 : -1}
            className={`tab ${tab === t.id ? 'is-on' : ''}`}
            href={href([topic.code, t.id])}
            onKeyDown={(e) => {
              const i = TABS.findIndex((x) => x.id === t.id);
              const to = e.key === 'ArrowRight' ? (i + 1) % TABS.length : e.key === 'ArrowLeft' ? (i + TABS.length - 1) % TABS.length : -1;
              if (to < 0) return;
              e.preventDefault();
              go([topic.code, TABS[to].id]);
              setTimeout(() => (document.querySelector(`.tabs .tab:nth-child(${to + 1})`) as HTMLElement | null)?.focus(), 0);
            }}
          >
            {t.label}
            <span className="tab-count">
              {t.id === 'learn' ? topic.cards.length : t.id === 'explore' ? topic.explore.length : t.id === 'solve' ? topic.solve.length : topic.mcqs.length}
            </span>
          </a>
        ))}
      </nav>
      <div className="tab-body" role="tabpanel">
        {tab === 'learn' && <LearnTab topic={topic} route={route} />}
        {tab === 'explore' && <ExploreTab topic={topic} itemId={item} />}
        {tab === 'solve' && <SolveTab topic={topic} genId={item} route={route} />}
        {tab === 'quiz' && <QuizTab topic={topic} route={route} />}
      </div>
      <nav className="prevnext">
        {prev ? <a href={href([prev.code, tab])}>← §{prev.num} {prev.short}</a> : <span />}
        {next ? <a href={href([next.code, tab])}>§{next.num} {next.short} →</a> : <span />}
      </nav>
    </div>
  );
}

function SeeAlso({ topic }: { topic: TopicDef }) {
  if (!topic.seeAlso?.length) return null;
  return (
    <div className="see-also">
      {topic.seeAlso.map((s) => (
        <a key={s.href} className="see-also-item" href={s.href}>
          <strong>{s.label} →</strong>
          {s.note && <Rich text={s.note} />}
        </a>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ Learn

function LearnTab({ topic, route }: { topic: TopicDef; route: Route }) {
  const view = route.query.get('v') === 'flash' ? 'flash' : 'cards';
  const cardId = route.query.get('c');
  const idx = Math.max(0, topic.cards.findIndex((c) => c.id === cardId));
  const card = topic.cards[idx];
  const setView = (v: string) => go([topic.code, 'learn'], { v: v === 'flash' ? 'flash' : undefined });
  return (
    <div>
      <div className="row between wrap gap-s">
        <Segmented
          label="Learn view"
          value={view}
          onChange={setView}
          options={[
            { value: 'cards', label: `Concept cards (${topic.cards.length})` },
            { value: 'flash', label: `Flashcards (${topic.flashcards.length})` },
          ]}
        />
      </div>
      {view === 'cards' ? (
        topic.cards.length ? (
          <div className="learn">
            <ol className="card-index" aria-label="Concept cards">
              {topic.cards.map((c, i) => (
                <li key={c.id}>
                  <a className={i === idx ? 'is-on' : ''} href={href([topic.code, 'learn'], { c: c.id })}>
                    <Rich text={c.title} inline />
                  </a>
                </li>
              ))}
            </ol>
            <div className="learn-main">
              <ConceptCardView card={card} topic={topic} />
              <div className="row between">
                {idx > 0 ? (
                  <LinkButton href={href([topic.code, 'learn'], { c: topic.cards[idx - 1].id })} variant="ghost">
                    ← <Rich text={topic.cards[idx - 1].title} inline />
                  </LinkButton>
                ) : (
                  <span />
                )}
                {idx < topic.cards.length - 1 ? (
                  <LinkButton href={href([topic.code, 'learn'], { c: topic.cards[idx + 1].id })}>
                    <Rich text={topic.cards[idx + 1].title} inline /> →
                  </LinkButton>
                ) : (
                  <LinkButton href={href([topic.code, 'explore'])} variant="primary">
                    Explore it →
                  </LinkButton>
                )}
              </div>
            </div>
          </div>
        ) : (
          <Callout kind="note">Concept cards for this topic are coming.</Callout>
        )
      ) : (
        <Flashcards cards={topic.flashcards} title={`${topic.code} flashcards`} />
      )}
    </div>
  );
}

// ------------------------------------------------------------------ Explore

function ExploreTab({ topic, itemId }: { topic: TopicDef; itemId?: string }) {
  const p = useProgress();
  const idx = topic.explore.findIndex((e) => e.id === itemId);
  const item = idx >= 0 ? topic.explore[idx] : undefined;
  if (!item) {
    return (
      <div>
        {topic.explore.length === 0 && <SeeAlso topic={topic} />}
        {topic.explore.length === 0 && !topic.seeAlso?.length && <Callout kind="note">Simulations for this topic are coming.</Callout>}
        <div className="item-grid">
          {topic.explore.map((e) => (
            <a key={e.id} className="item-tile" href={href([topic.code, 'explore', e.id])}>
              <div className="item-title">
                <Rich text={e.title} inline />
              </div>
              <Rich text={e.summary} />
              <div className="row gap-s wrap">
                {e.challenge && <Badge tone={p.challenges[e.challenge.id] ? 'ok' : 'warn'}>{p.challenges[e.challenge.id] ? '✓ challenge done' : `Challenge: ${e.challenge.title}`}</Badge>}
                {e.minutes && <Badge>{e.minutes} min</Badge>}
              </div>
            </a>
          ))}
        </div>
        {topic.explore.length > 0 && <SeeAlso topic={topic} />}
      </div>
    );
  }
  const Comp = item.component;
  const prev = topic.explore[idx - 1];
  const next = topic.explore[idx + 1];
  return (
    <div className="explore">
      <div className="row between wrap gap-s">
        <a href={href([topic.code, 'explore'])} className="back">
          ← All {topic.short} simulations
        </a>
        {item.challenge && <Badge tone={p.challenges[item.challenge.id] ? 'ok' : 'warn'}>{p.challenges[item.challenge.id] ? '✓ challenge complete' : `Challenge: ${item.challenge.title}`}</Badge>}
      </div>
      <h2>
        <Rich text={item.title} inline />
      </h2>
      <Rich text={item.summary} className="lede" />
      <div className="notice" role="note">
        <span className="notice-tag">What to notice</span>
        <Rich text={item.notice} inline />
      </div>
      <Comp key={item.id} />
      <nav className="prevnext">
        {prev ? (
          <a href={href([topic.code, 'explore', prev.id])}>
            ← <Rich text={prev.title} inline />
          </a>
        ) : (
          <span />
        )}
        {next ? (
          <a href={href([topic.code, 'explore', next.id])}>
            <Rich text={next.title} inline /> →
          </a>
        ) : (
          <a href={href([topic.code, 'solve'])}>Practise it in Solve →</a>
        )}
      </nav>
    </div>
  );
}

// ------------------------------------------------------------------ Solve

function SolveTab({ topic, genId, route }: { topic: TopicDef; genId?: string; route: Route }) {
  const p = useProgress();
  const gen = topic.solve.find((g) => g.id === genId);
  const tierQ = Number(route.query.get('t'));
  const seedQ = Number(route.query.get('s'));
  const tier = (gen && gen.tiers.includes(tierQ as Tier) ? tierQ : gen ? (gen.tiers.includes(2) ? 2 : gen.tiers[0]) : 2) as Tier;
  const [nonce, setNonce] = useState(0);

  // Give every problem a seed in the URL so it can be bookmarked and replayed.
  useEffect(() => {
    if (gen && !seedQ) replace([topic.code, 'solve', gen.id], { t: tier, s: freshSeed() });
  }, [gen, seedQ, tier, topic.code]);

  if (!gen) {
    return (
      <div>
        {topic.solve.length === 0 && <SeeAlso topic={topic} />}
        {topic.solve.length === 0 && !topic.seeAlso?.length && <Callout kind="note">Problem generators for this topic are coming.</Callout>}
        <div className="item-grid">
          {topic.solve.map((g) => {
            const st = p.items[`solve:${g.id}`];
            return (
              <a key={g.id} className="item-tile" href={href([topic.code, 'solve', g.id])}>
                <div className="item-title">
                  <Rich text={g.title} inline />
                </div>
                {g.summary && <Rich text={g.summary} />}
                <div className="row gap-s wrap">
                  {g.tiers.map((t) => (
                    <Badge key={t}>{TIER_LABEL[t]}</Badge>
                  ))}
                  {st && (
                    <Badge tone={st.ok / st.n >= 0.7 ? 'ok' : 'warn'}>
                      {st.ok}/{st.n} right
                    </Badge>
                  )}
                </div>
                <Rich text={g.source} inline className="muted small" />
              </a>
            );
          })}
        </div>
      </div>
    );
  }
  const seed = seedQ || 1;
  const idx = topic.solve.indexOf(gen);
  const nextGen = topic.solve[idx + 1];
  return (
    <div className="solve-page">
      <div className="row between wrap gap-s">
        <a href={href([topic.code, 'solve'])} className="back">
          ← All {topic.short} problems
        </a>
        <Segmented
          label="Difficulty"
          value={tier}
          onChange={(t) => go([topic.code, 'solve', gen.id], { t, s: freshSeed() })}
          options={gen.tiers.map((t) => ({ value: t, label: TIER_LABEL[t] }))}
        />
      </div>
      <h2>
        <Rich text={gen.title} inline />
      </h2>
      <SolveRunner key={`${gen.id}-${seed}-${tier}-${nonce}`} topic={topic} gen={gen} tier={tier} seed={seed} />
      <div className="row gap-s wrap solve-actions">
        <Button variant="primary" onClick={() => go([topic.code, 'solve', gen.id], { t: tier, s: freshSeed() })}>
          New problem
        </Button>
        <Button onClick={() => setNonce((n) => n + 1)}>Same numbers again</Button>
        {nextGen && (
          <LinkButton href={href([topic.code, 'solve', nextGen.id])}>
            Next type: <Rich text={nextGen.title} inline /> →
          </LinkButton>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Quiz

function QuizTab({ topic, route }: { topic: TopicDef; route: Route }) {
  const games = topic.games || [];
  const shorts = topic.shortAnswers || [];
  const qid = route.query.get('q');
  const gid = route.query.get('g');
  const said = route.query.get('sa');
  const view = gid || route.query.get('v') === 'games' ? 'games' : said || route.query.get('v') === 'short' ? 'short' : 'mcq';
  const setView = (v: string) => go([topic.code, 'quiz'], { v: v === 'mcq' ? undefined : v });
  return (
    <div>
      <Segmented
        label="Quiz view"
        value={view}
        onChange={setView}
        options={[
          { value: 'mcq', label: `MCQs (${topic.mcqs.length})` },
          { value: 'games', label: `Method games (${games.length})` },
          ...(shorts.length ? [{ value: 'short', label: `Short answers (${shorts.length})` }] : []),
        ]}
      />
      {view === 'mcq' && <McqSession topic={topic} focusId={qid} />}
      {view === 'games' &&
        (games.length ? (
          <div className="stack">
            {games
              .filter((g) => !gid || g.id === gid)
              .map((g) => (
                <section key={g.id} className="card">
                  <h3 className="card-title">
                    <Rich text={g.title} inline />
                  </h3>
                  {g.kind === 'sort' ? <SortGameView game={g} topic={topic} /> : <MatchGameView game={g} topic={topic} />}
                </section>
              ))}
            {gid && <a href={href([topic.code, 'quiz'], { v: 'games' })}>Show all games</a>}
          </div>
        ) : (
          <Callout kind="note">No method games for this topic yet.</Callout>
        ))}
      {view === 'short' && (
        <div className="stack">
          {shorts
            .filter((s) => !said || s.id === said)
            .map((s) => (
              <section key={s.id} className="card">
                <ShortAnswerView sa={s} topic={topic} />
              </section>
            ))}
        </div>
      )}
    </div>
  );
}

function McqSession({ topic, focusId }: { topic: TopicDef; focusId: string | null }) {
  const p = useProgress();
  const [round, setRound] = useState(0);
  const queue = useMemo(() => {
    if (focusId) {
      const q = topic.mcqs.find((m) => m.id === focusId);
      if (q) return [q];
    }
    const scored = topic.mcqs.map((m, i) => ({ m, s: itemPriority(p, `quiz:${m.id}`) + ((i * 7919 + round * 104729) % 97) / 970 }));
    return scored
      .sort((a, b) => a.s - b.s)
      .slice(0, 10)
      .map((x) => x.m);
    // Recompute only when a new round starts, not after every answer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topic, round, focusId]);
  const [i, setI] = useState(0);
  const [answered, setAnswered] = useState<boolean[]>([]);
  useEffect(() => {
    setI(0);
    setAnswered([]);
  }, [queue]);
  if (!topic.mcqs.length) return <Callout kind="note">MCQs for this topic are coming.</Callout>;
  if (i >= queue.length) {
    const right = answered.filter(Boolean).length;
    return (
      <Callout kind={right === queue.length ? 'ok' : 'info'} title={`Set done: ${right} / ${queue.length}`}>
        <p>Missed questions come back first next round. Your misses are listed in the session summary.</p>
        <div className="row gap-s">
          <Button variant="primary" onClick={() => setRound((r) => r + 1)}>
            New set
          </Button>
          <LinkButton href="#/session">Session summary</LinkButton>
        </div>
      </Callout>
    );
  }
  const q = queue[i];
  const isDone = answered[i] !== undefined;
  return (
    <div className="mcq-session">
      <div className="row between">
        <span className="muted small">
          Question {i + 1} of {queue.length}
        </span>
        <span className="muted small">{answered.filter(Boolean).length} right so far</span>
      </div>
      <MCQView key={`${q.id}-${round}`} mcq={q} topic={topic} salt={round} onAnswered={(ok) => setAnswered((a) => { const n = a.slice(); n[i] = ok; return n; })} />
      {isDone && (
        <Button variant="primary" onClick={() => setI(i + 1)} autoFocus>
          {i + 1 < queue.length ? 'Next question →' : 'Finish set'}
        </Button>
      )}
    </div>
  );
}
