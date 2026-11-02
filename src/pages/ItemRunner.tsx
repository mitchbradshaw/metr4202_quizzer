// Runs a list of mixed items (MCQs, generated problems, short answers): used by the exam sprints and mixed review.
import { useEffect, useState, type ReactNode } from 'react';
import type { MCQ, ShortAnswer, SolveGenerator, Tier, TopicDef } from '../engine/types';
import { MCQView } from '../ui/MCQView';
import { SolveRunner, partMarks, plural } from '../ui/SolveRunner';
import { ShortAnswerView } from '../ui/ShortAnswerView';
import { Badge, Button, Callout, LinkButton, ProgressBar } from '../ui/kit';
import { Rich } from '../ui/Rich';
import { href } from '../app/router';
import { makeRng } from '../engine/rng';

export type RunItem =
  | { kind: 'mcq'; topic: TopicDef; mcq: MCQ; section?: string; marks: number }
  | { kind: 'solve'; topic: TopicDef; gen: SolveGenerator; tier: Tier; seed: number; section?: string; marks: number }
  | { kind: 'short'; topic: TopicDef; sa: ShortAnswer; section?: string; marks: number };

export interface ItemResult {
  score: number;
  max: number;
  ok: boolean;
}

export function itemTitle(it: RunItem): string {
  if (it.kind === 'mcq') return it.mcq.stem.replace(/\$\$[\s\S]*?\$\$|\$[^$]*\$/g, '…').replace(/\*\*/g, '').slice(0, 80);
  if (it.kind === 'solve') return it.gen.title;
  return it.sa.prompt.replace(/\$[^$]*\$/g, '…').slice(0, 80);
}

export function itemHref(it: RunItem): string {
  if (it.kind === 'mcq') return href([it.topic.code, 'quiz'], { q: it.mcq.id });
  if (it.kind === 'solve') return href([it.topic.code, 'solve', it.gen.id], { t: it.tier, s: it.seed });
  return href([it.topic.code, 'quiz'], { sa: it.sa.id });
}

/** Marks for a generated problem (sum of its part marks for this seed). */
export function solveMarks(gen: SolveGenerator, tier: Tier, seed: number): number {
  try {
    return gen.generate(makeRng(seed), tier).parts.reduce((t, p) => t + partMarks(p), 0);
  } catch {
    return gen.marks ?? 4;
  }
}

function fmtClock(s: number) {
  const m = Math.floor(Math.max(0, s) / 60);
  const ss = Math.floor(Math.max(0, s) % 60);
  return `${m}:${ss.toString().padStart(2, '0')}`;
}

export function ItemRunner({
  items,
  minutes,
  onFinish,
  title,
  requireStart,
  showPartMarks,
  runKey = '',
  intro,
}: {
  items: RunItem[];
  /** Countdown length; omit for untimed. */
  minutes?: number;
  onFinish?: (results: (ItemResult | undefined)[], secs: number) => void;
  title: string;
  /** Show an intro with a Start button; the clock starts only then. */
  requireStart?: boolean;
  /** Show "[n marks]" against each part (mock paper). */
  showPartMarks?: boolean;
  /** Distinguishes runs, so remembered answers never leak between sets. */
  runKey?: string | number;
  intro?: ReactNode;
}) {
  const [cur, setCur] = useState(0);
  const [results, setResults] = useState<(ItemResult | undefined)[]>([]);
  const [start, setStart] = useState<number | null>(() => (requireStart ? null : Date.now()));
  const [now, setNow] = useState(() => Date.now());
  const [finished, setFinished] = useState(false);
  const elapsed = start === null ? 0 : (now - start) / 1000;
  const left = minutes ? minutes * 60 - elapsed : Infinity;

  useEffect(() => {
    if (finished || start === null) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [finished, start]);

  const finish = () => {
    if (finished) return;
    setFinished(true);
    onFinish?.(results, Math.round((Date.now() - (start ?? Date.now())) / 1000));
  };
  useEffect(() => {
    if (left <= 0 && !finished) finish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [left, finished]);

  const setResult = (i: number, r: ItemResult) =>
    setResults((prev) => {
      if (prev[i]) return prev;
      const n = prev.slice();
      n[i] = r;
      return n;
    });

  const totalMax = items.reduce((t, it) => t + it.marks, 0);
  const score = results.reduce((t, r) => t + (r ? r.score : 0), 0);

  if (!items.length) return <Callout kind="note">Not enough content yet to build this set.</Callout>;

  if (start === null) {
    const marks = items.reduce((t, it) => t + it.marks, 0);
    return (
      <div className="card runner-intro">
        <h3 className="card-title">{title}</h3>
        {intro}
        <p>
          {plural(items.length, 'item')}, {plural(Math.round(marks * 10) / 10, 'mark')}
          {minutes ? `, ${minutes} minutes (${(minutes / Math.max(1, marks)).toFixed(1)} min per mark)` : ''}. The clock starts when you press Start.
        </p>
        <Button variant="primary" onClick={() => { setStart(Date.now()); setNow(Date.now()); }}>
          Start{minutes ? ` (${minutes}:00)` : ''}
        </Button>
      </div>
    );
  }

  if (finished) {
    const sections = [...new Set(items.map((it) => it.section).filter(Boolean))] as string[];
    return (
      <div className="runner-done">
        <Callout kind={score >= 0.7 * totalMax ? 'ok' : 'info'} title={`${title}: ${Math.round(score * 10) / 10} / ${totalMax} marks (${totalMax ? Math.round((100 * score) / totalMax) : 0} %)`}>
          <p>
            Time used {fmtClock(elapsed)}
            {minutes ? ` of ${minutes}:00` : ''}. Unanswered items score zero.
          </p>
        </Callout>
        {sections.length > 0 && (
          <table className="table">
            <thead>
              <tr>
                <th>Section</th>
                <th>Marks</th>
              </tr>
            </thead>
            <tbody>
              {sections.map((s) => {
                const idx = items.map((it, i) => (it.section === s ? i : -1)).filter((i) => i >= 0);
                const got = idx.reduce((t, i) => t + (results[i]?.score ?? 0), 0);
                const max = idx.reduce((t, i) => t + items[i].marks, 0);
                return (
                  <tr key={s}>
                    <td>{s}</td>
                    <td className="mono">
                      {Math.round(got * 10) / 10} / {max}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <ol className="result-list">
          {items.map((it, i) => {
            const r = results[i];
            return (
              <li key={i} className={r ? (r.ok ? 'ok-text' : 'bad-text') : 'muted'}>
                <span className="result-mark">{r ? (r.ok ? '✓' : '✗') : '–'}</span> <Badge>{it.topic.code}</Badge> {itemTitle(it)}{' '}
                <a href={itemHref(it)}>review →</a>
                {it.kind === 'mcq' && r && !r.ok && (
                  <div className="result-why">
                    Answer: <Rich text={it.mcq.options.find((o) => o.correct)?.text || ''} inline /> — <Rich text={it.mcq.options.find((o) => o.correct)?.why || ''} inline />
                  </div>
                )}
              </li>
            );
          })}
        </ol>
        <div className="row gap-s">
          <LinkButton href="#/session" variant="primary">
            Session summary
          </LinkButton>
          <LinkButton href="#/">Home</LinkButton>
        </div>
      </div>
    );
  }

  const it = items[cur];
  return (
    <div className="runner">
      <div className="runner-bar">
        <div className="runner-nav" role="tablist" aria-label="Items">
          {items.map((x, i) => (
            <button
              key={i}
              type="button"
              role="tab"
              aria-selected={i === cur}
              className={`runner-dot ${i === cur ? 'is-on' : ''} ${results[i] ? (results[i]!.ok ? 'is-ok' : 'is-bad') : ''}`}
              onClick={() => setCur(i)}
              title={`${x.section ? `${x.section} · ` : ''}${x.topic.code}: ${itemTitle(x)}`}
            >
              {i + 1}
            </button>
          ))}
        </div>
        <div className="row gap-s">
          {minutes !== undefined && <span className={`clock ${left < 120 ? 'bad-text' : ''}`}>⏱ {fmtClock(left)}</span>}
          <Button size="sm" onClick={finish}>
            Finish
          </Button>
        </div>
      </div>
      <ProgressBar value={results.filter(Boolean).length} max={items.length} label="Answered" />
      <div className="runner-item">
        <div className="row gap-s wrap">
          {it.section && <Badge tone="accent">{it.section}</Badge>}
          <a href={href(it.topic.code)}>
            <Badge>
              {it.topic.code} {it.topic.short}
            </Badge>
          </a>
          <Badge>{plural(Math.round(it.marks * 10) / 10, 'mark')}</Badge>
        </div>
        {it.kind === 'mcq' && <MCQView key={`m${cur}`} mcq={it.mcq} topic={it.topic} exam persistKey={`${runKey}-${cur}`} onAnswered={(ok) => setResult(cur, { ok, score: ok ? it.marks : 0, max: it.marks })} />}
        {it.kind === 'solve' && (
          <>
            <h3>
              <Rich text={it.gen.title} inline />
            </h3>
            <SolveRunner
              key={`s${cur}`}
              topic={it.topic}
              gen={it.gen}
              tier={it.tier}
              seed={it.seed}
              exam
              showMarks={!!showPartMarks}
              resetKey={`${runKey}-${cur}`}
              onOutcome={(o) => setResult(cur, { ok: o.allCorrect, score: o.max ? (o.score / o.max) * it.marks : 0, max: it.marks })}
            />
          </>
        )}
        {it.kind === 'short' && (
          <ShortAnswerView key={`a${cur}`} sa={it.sa} topic={it.topic} onMarked={(got, of) => setResult(cur, { ok: got >= Math.ceil(of * 0.6), score: of ? (got / of) * it.marks : 0, max: it.marks })} />
        )}
      </div>
      <div className="row between">
        <Button onClick={() => setCur(Math.max(0, cur - 1))} disabled={cur === 0}>
          ← Previous
        </Button>
        {cur < items.length - 1 ? (
          <Button variant="primary" onClick={() => setCur(cur + 1)}>
            Next →
          </Button>
        ) : (
          <Button variant="primary" onClick={finish}>
            Finish and see results
          </Button>
        )}
      </div>
    </div>
  );
}
