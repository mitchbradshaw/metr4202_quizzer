// Runs one generated problem: prompt, givens, parts with checking, hint ladder, formula link, citations.
// Progress is honest: the first wrong answer to any part records the attempt (and its trap) at once,
// so abandoning a problem still counts; typed answers survive tab switches (usePersisted).
import { useEffect, useMemo, useState } from 'react';
import type { ConceptCard, CustomPart, SolveGenerator, SolvePart, Tier, TopicDef } from '../engine/types';
import { makeRng } from '../engine/rng';
import { Rich, TeX } from './Rich';
import { Badge, Button, Callout, Modal } from './kit';
import { ChoiceInput, MatrixInput, NumericInput, OrderInput, TermBuilder, type PartResult } from './inputs';
import { ConceptCardView } from './ConceptCardView';
import { logTrap, recordAttempt } from '../app/store';
import { href } from '../app/router';
import { trapById } from '../engine/traps';
import { usePersisted } from './persist';

export const TIER_LABEL: Record<Tier, string> = { 1: 'Warm-up', 2: 'Exam', 3: 'Stretch' };

function CustomPartView({ part, onResult, seed, pkey }: { part: CustomPart; onResult: (r: PartResult) => void; seed: number; pkey: string }) {
  const Comp = part.render;
  return (
    <div className="part-input">
      <Comp onResult={onResult} seed={seed} pkey={pkey} />
    </div>
  );
}
const HINT_LABEL = ['Concept', 'Set-up', 'Substitution', 'Worked solution'];

export interface SolveOutcome {
  score: number;
  max: number;
  allCorrect: boolean;
}

export function partMarks(p: SolvePart): number {
  return p.marks ?? (p.kind === 'terms' ? 4 : p.kind === 'matrix' || p.kind === 'custom' ? 3 : 2);
}

/** METR4202 exam pace: 120 minutes for 80 marks. */
export const MIN_PER_MARK = 1.5;

/** Optional pace timer: elapsed time against the exam allowance for this problem's marks. */
export function PaceTimer({ marks, pkey }: { marks: number; pkey: string }) {
  const [start, setStart] = usePersisted<number | null>(`${pkey}:pace`, null);
  const [, setTick] = useState(0);
  useEffect(() => {
    if (start === null) return;
    const id = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, [start]);
  const target = marks * MIN_PER_MARK * 60;
  if (start === null)
    return (
      <Button size="sm" variant="ghost" onClick={() => setStart(Date.now())} title={`Exam pace is ${MIN_PER_MARK} min per mark`}>
        ⏱ Pace timer ({fmtClock(target)} for {plural(marks, 'mark')})
      </Button>
    );
  const secs = Math.floor((Date.now() - start) / 1000);
  const over = secs > target;
  return (
    <span className={`badge ${over ? 'badge-warn' : 'badge-accent'}`} role="timer" aria-live="off" title={`Exam pace: ${MIN_PER_MARK} min per mark`}>
      ⏱ {fmtClock(secs)} / {fmtClock(target)}
      {over ? ' · over exam pace' : ''}
      <button type="button" className="pace-stop" aria-label="Stop the pace timer" onClick={() => setStart(null)}>
        ✕
      </button>
    </span>
  );
}

const fmtClock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

interface Meta {
  recorded: boolean;
  assisted: boolean;
  outcomeSent: boolean;
}

export function SolveRunner({
  topic,
  gen,
  tier,
  seed,
  exam,
  showMarks = exam,
  resetKey = 0,
  onOutcome,
}: {
  topic: TopicDef;
  gen: SolveGenerator;
  tier: Tier;
  seed: number;
  /** Exam mode (sprints): no hints until every part is answered; first answer per part counts. */
  exam?: boolean;
  /** Show "[n marks]" per part (mock paper). */
  showMarks?: boolean;
  /** Changing it starts the same problem afresh ("Same numbers again"). */
  resetKey?: number | string;
  onOutcome?: (o: SolveOutcome) => void;
}) {
  const inst = useMemo(() => {
    try {
      return gen.generate(makeRng(seed), tier);
    } catch (e) {
      console.error(e);
      return null;
    }
  }, [gen, seed, tier]);
  const base = `solve|${topic.code}|${gen.id}|${tier}|${seed}|${resetKey}`;
  const [first, setFirst] = usePersisted<Record<string, PartResult>>(`${base}:first`, {});
  const [hints, setHints] = usePersisted<number>(`${base}:hints`, 0);
  const [meta, setMeta] = usePersisted<Meta>(`${base}:meta`, { recorded: false, assisted: false, outcomeSent: false });
  const [showCard, setShowCard] = useState(false);

  if (!inst) return <Callout kind="bad" title="This problem failed to generate">Try another seed.</Callout>;

  const card: ConceptCard | undefined = topic.cards.find((c) => c.id === gen.cardId);
  const allAnswered = inst.parts.every((p) => first[p.id]);
  const itemHref = href([topic.code, 'solve', gen.id], { t: tier, s: seed });

  const onPart = (p: SolvePart) => (r: PartResult) => {
    if (first[p.id]) return; // only the first answer to each part counts
    const next = { ...first, [p.id]: r };
    setFirst(next);
    const m = { ...meta };
    if (!r.correct && !m.recorded) {
      // First mistake: the attempt is a miss whatever happens next. Record it now, trap included.
      m.recorded = true;
      recordAttempt({
        topic: topic.code,
        kind: 'solve',
        id: gen.id,
        tier,
        ok: false,
        trapId: r.trapId,
        title: gen.title,
        href: itemHref,
        note: r.trapId ? trapById(r.trapId)?.title : undefined,
      });
    } else if (!r.correct && r.trapId) {
      logTrap({ topic: topic.code, trapId: r.trapId, key: `solve:${gen.id}`, title: gen.title, href: itemHref, note: trapById(r.trapId)?.title });
    }
    const done = inst.parts.every((q) => next[q.id]);
    if (done && !m.recorded) {
      m.recorded = true;
      recordAttempt({
        topic: topic.code,
        kind: 'solve',
        id: gen.id,
        tier,
        ok: !m.assisted,
        title: gen.title,
        href: itemHref,
        note: m.assisted ? 'worked solution viewed first' : undefined,
      });
    }
    if (done && !m.outcomeSent) {
      m.outcomeSent = true;
      const allOk = inst.parts.every((q) => next[q.id].correct) && !m.assisted;
      const max = inst.parts.reduce((t, q) => t + partMarks(q), 0);
      const score = inst.parts.reduce((t, q) => t + (next[q.id].correct ? partMarks(q) : 0), 0);
      onOutcome?.({ score, max, allCorrect: allOk });
    }
    setMeta(m);
  };

  const revealHint = () => {
    const n = Math.min(4, hints + 1);
    if (n === 4 && !allAnswered && !meta.assisted) setMeta({ ...meta, assisted: true });
    setHints(n);
  };
  const hintsLocked = exam && !allAnswered;

  return (
    <div className="solve">
      <div className="solve-meta">
        <Badge tone="accent">{TIER_LABEL[tier]}</Badge>
        <Badge title="Replay this exact problem with the same seed">seed {seed}</Badge>
        <Rich text={gen.source} inline className="muted small" />
        {!exam && <PaceTimer marks={gen.marks ?? inst.parts.reduce((t, q) => t + partMarks(q), 0)} pkey={base} />}
      </div>
      <Rich text={inst.prompt} />
      {inst.givens && inst.givens.length > 0 && (
        <table className="givens">
          <tbody>
            {inst.givens.map((g, i) => (
              <tr key={i}>
                <th>
                  <TeX>{g.sym}</TeX>
                </th>
                <td className="mono">
                  <Rich text={g.value} inline />
                </td>
                <td className="muted">{g.label && <Rich text={g.label} inline />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {inst.figure && (
        <div className="solve-figure">
          <inst.figure />
        </div>
      )}
      <ol className="parts">
        {inst.parts.map((p) => {
          const pk = `${base}:${p.id}`;
          return (
            <li key={`${seed}-${tier}-${p.id}`} className="part">
              <div className="part-label">
                <Rich text={p.label} />
                {showMarks && <span className="muted small"> [{plural(partMarks(p), 'mark')}]</span>}
              </div>
              {p.kind === 'numeric' && <NumericInput part={p} onResult={onPart(p)} pkey={pk} />}
              {p.kind === 'matrix' && <MatrixInput part={p} onResult={onPart(p)} pkey={pk} />}
              {p.kind === 'order' && <OrderInput part={p} onResult={onPart(p)} seed={seed} pkey={pk} />}
              {p.kind === 'choice' && <ChoiceInput part={p} onResult={onPart(p)} seed={seed} pkey={pk} />}
              {p.kind === 'terms' && <TermBuilder part={p} onResult={onPart(p)} seed={seed} pkey={pk} />}
              {p.kind === 'custom' && <CustomPartView part={p} onResult={onPart(p)} seed={seed} pkey={pk} />}
            </li>
          );
        })}
      </ol>

      <div className="hints">
        <div className="row gap-s wrap">
          <span className="muted small">Hints:</span>
          {HINT_LABEL.map((h, i) => (
            <Badge key={h} tone={i < hints ? 'accent' : 'muted'}>
              {i + 1}. {h}
            </Badge>
          ))}
          {hints < 4 && (
            <Button size="sm" onClick={revealHint} disabled={hintsLocked} title={hintsLocked ? 'Answer every part first (exam mode)' : undefined}>
              {hints === 3 ? 'Show worked solution' : `Show ${HINT_LABEL[hints].toLowerCase()} hint`}
            </Button>
          )}
          {card && (
            <Button size="sm" variant="ghost" onClick={() => setShowCard(true)}>
              Show the formula
            </Button>
          )}
        </div>
        {inst.hints.slice(0, hints).map((h, i) => (
          <div key={i} className={`hint hint-${i}`}>
            <div className="hint-title">{HINT_LABEL[i]}</div>
            <Rich text={h} />
          </div>
        ))}
        {exam && allAnswered && hints < 4 && (
          <Button size="sm" onClick={() => setHints(4)}>
            See the worked solution
          </Button>
        )}
      </div>
      {card && (
        <Modal open={showCard} onClose={() => setShowCard(false)} title={card.title} wide>
          <ConceptCardView card={card} topic={topic} compact />
        </Modal>
      )}
    </div>
  );
}
