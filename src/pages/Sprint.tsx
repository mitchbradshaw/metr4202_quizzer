// Exam sprints: Quick (≈12 auto-marked items, 20 min) and Mock (the real METR4202 format: 20 MCQs, ≈20 marks of
// short answers and the three long-answer templates, 120 min).
import { useEffect, useState } from 'react';
import { TOPICS, challengeIds } from '../topics';
import type { TopicCode } from '../engine/codes';
import type { Tier, TopicDef } from '../engine/types';
import { freshSeed, makeRng, type Rng } from '../engine/rng';
import { getProgress, itemPriority, mastery, recordSprint, useProgress } from '../app/store';
import { ItemRunner, solveMarks, type RunItem } from './ItemRunner';
import { Button, Callout, LinkButton } from '../ui/kit';
import { fmt } from '../engine/format';

const pickTier = (tiers: Tier[]): Tier => (tiers.includes(2) ? 2 : tiers[0]);

/** Weighted pick of up to n items, preferring weak topics and unseen/often-missed items. */
function weightedPick<T extends RunItem>(pool: T[], n: number, rng: Rng, perTopicCap = 3): T[] {
  const p = getProgress();
  const scored = pool.map((it) => {
    const m = mastery(p, it.topic.code, challengeIds(it.topic)).value;
    const key = it.kind === 'mcq' ? `quiz:${it.mcq.id}` : it.kind === 'solve' ? `solve:${it.gen.id}` : `short:${it.sa.id}`;
    const pr = itemPriority(p, key);
    const w = (1.6 - m) * Math.exp(-0.6 * pr);
    return { it, s: Math.pow(rng.next(), 1 / Math.max(0.05, w)) };
  });
  scored.sort((a, b) => b.s - a.s);
  const out: T[] = [];
  const perTopic: Record<string, number> = {};
  for (const { it } of scored) {
    if (out.length >= n) break;
    const c = perTopic[it.topic.code] || 0;
    if (c >= perTopicCap) continue;
    perTopic[it.topic.code] = c + 1;
    out.push(it);
  }
  return out;
}

function mcqPool(codes: TopicCode[] | null, section?: string): RunItem[] {
  return TOPICS.filter((t) => !codes || codes.includes(t.code)).flatMap((t) =>
    t.mcqs.map((mcq) => ({ kind: 'mcq' as const, topic: t, mcq, section, marks: mcq.marks ?? 1 }))
  );
}

function solvePool(codes: TopicCode[] | null, rng: Rng, opts: { section?: string; sprintOnly?: boolean } = {}): RunItem[] {
  return TOPICS.filter((t) => !codes || codes.includes(t.code)).flatMap((t: TopicDef) =>
    t.solve
      .filter((g) => !opts.sprintOnly || g.sprint !== false)
      .map((gen) => {
        const tier = pickTier(gen.tiers);
        const seed = 100000 + Math.floor(rng.next() * 900000);
        return { kind: 'solve' as const, topic: t, gen, tier, seed, section: opts.section, marks: solveMarks(gen, tier, seed) };
      })
  );
}

export function buildQuick(seed: number): RunItem[] {
  const rng = makeRng(seed);
  const solves = weightedPick(solvePool(null, rng, { sprintOnly: true }), 5, rng, 1);
  const mcqs = weightedPick(mcqPool(null), 12 - solves.length, rng, 2);
  // Normalise marks: 1 per item in the quick sprint.
  return rng.shuffle([...mcqs, ...solves]).map((it) => ({ ...it, marks: 1 }));
}

/** MCQs per topic on the real paper (2023–2025 all follow this split). */
const MCQ_SPLIT: [TopicCode, number][] = [
  ['bayes', 3],
  ['filters', 2],
  ['models', 1],
  ['slam', 2],
  ['plan', 2],
  ['kin', 2],
  ['vision', 3],
  ['rl', 3],
  ['multi', 2],
];

/** The three long-answer templates; one generator is drawn from each pool. */
const LONG: { section: string; pool: [TopicCode, string][] }[] = [
  { section: 'Section 3: discrete Bayes / occupancy', pool: [['bayes', 'bayes-grid'], ['bayes', 'bayes-classifier'], ['slam', 'slam-occupancy']] },
  { section: 'Section 3: planning by hand', pool: [['plan', 'plan-astar'], ['plan', 'plan-rrtstar'], ['plan', 'plan-steer']] },
  { section: 'Section 3: arm + camera', pool: [['kin', 'kin-arm-camera'], ['kin', 'kin-screws'], ['kin', 'kin-m']] },
];

export function buildMock(seed: number): RunItem[] {
  const rng = makeRng(seed);
  const mcqs = MCQ_SPLIT.flatMap(([code, n]) => weightedPick(mcqPool([code], 'Section 1: multiple choice'), n, rng, n)).map((it) => ({ ...it, marks: 1 }));
  // Short answers: aim for ~20 marks, at most one per topic first, then top up.
  const shortPool: RunItem[] = TOPICS.flatMap((t) => (t.shortAnswers || []).map((sa) => ({ kind: 'short' as const, topic: t, sa, section: 'Section 2: short answer', marks: sa.marks ?? 2 })));
  const shorts: RunItem[] = [];
  let shortMarks = 0;
  for (const it of weightedPick(shortPool, shortPool.length, rng, 1)) {
    if (shortMarks >= 20) break;
    if (shortMarks + it.marks > 22) continue;
    shorts.push(it);
    shortMarks += it.marks;
  }
  const longs: RunItem[] = [];
  for (const L of LONG) {
    const avail = L.pool
      .map(([code, id]) => ({ t: TOPICS.find((t) => t.code === code), id }))
      .filter((x) => x.t && x.t.solve.some((g) => g.id === x.id));
    if (!avail.length) continue;
    const pick = rng.pick(avail);
    const gen = pick.t!.solve.find((g) => g.id === pick.id)!;
    const tier = pickTier(gen.tiers);
    const s = 100000 + Math.floor(rng.next() * 900000);
    longs.push({ kind: 'solve', topic: pick.t!, gen, tier, seed: s, section: L.section, marks: solveMarks(gen, tier, s) });
  }
  return [...mcqs, ...shorts, ...longs];
}

/** Exam pace: 120 min for 80 marks (1.5 min per mark), capped at the real 120 minutes. */
export function mockMinutes(items: RunItem[]): number {
  const marks = items.reduce((t, it) => t + it.marks, 0);
  return Math.max(30, Math.min(120, Math.round((1.5 * marks) / 5) * 5));
}

// Keep an in-progress sprint across route changes (leaving and coming back resumes the same set).
type Run = { mode: 'quick' | 'mock'; seed: number; items: RunItem[] };
let active: Run | null = null;

function getOrCreate(mode: 'quick' | 'mock'): Run {
  if (!active || active.mode !== mode) {
    const seed = freshSeed();
    active = { mode, seed, items: mode === 'quick' ? buildQuick(seed) : buildMock(seed) };
  }
  return active;
}

export function Sprint({ mode }: { mode?: 'quick' | 'mock' }) {
  const p = useProgress();
  const [run, setRun] = useState<Run | null>(() => (mode ? getOrCreate(mode) : null));
  useEffect(() => {
    setRun(mode ? getOrCreate(mode) : null);
  }, [mode]);
  const items = run?.items ?? [];

  if (!mode) {
    const last = p.sprints.slice(-8).reverse();
    return (
      <div className="stack">
        <h1>Exam sprint</h1>
        <div className="item-grid">
          <a className="item-tile" href="#/sprint/quick">
            <div className="item-title">Quick sprint · 20 min</div>
            <p>About 12 auto-marked items across all topics, weighted towards your weakest topics and anything you missed recently. Daily practice.</p>
          </a>
          <a className="item-tile" href="#/sprint/mock">
            <div className="item-title">Mock paper · 120 min</div>
            <p>
              The real format: 20 MCQs in the paper's topic split, about 20 marks of short answers (self-marked against key points), and the three
              long-answer templates with fresh numbers (a Bayes or occupancy update, planning by hand, and the arm question).
            </p>
          </a>
        </div>
        {last.length > 0 && (
          <table className="table">
            <thead>
              <tr>
                <th>When</th>
                <th>Mode</th>
                <th>Score</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {last.map((s) => (
                <tr key={s.t}>
                  <td>{new Date(s.t).toLocaleString()}</td>
                  <td>{s.mode}</td>
                  <td className="mono">
                    {fmt(s.score, 3)} / {s.max} ({Math.round((100 * s.score) / (s.max || 1))} %)
                  </td>
                  <td className="mono">{Math.round(s.secs / 60)} min</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    );
  }

  return (
    <div className="stack">
      <div className="row between wrap gap-s">
        <h1>{mode === 'quick' ? 'Quick sprint' : 'Mock paper'}</h1>
        <div className="row gap-s">
          <Button
            onClick={() => {
              active = null;
              setRun(getOrCreate(mode));
            }}
          >
            New set
          </Button>
          <LinkButton href="#/sprint" variant="ghost">
            All sprints
          </LinkButton>
        </div>
      </div>
      {mode === 'mock' && (
        <Callout kind="info">
          First answers count. Hints unlock once you have answered every part of a problem. Write the formula, substitute, then compute, exactly as you would on paper.
        </Callout>
      )}
      <ItemRunner
        key={run?.seed}
        items={items}
        minutes={mode === 'quick' ? 20 : mockMinutes(items)}
        requireStart
        showPartMarks={mode === 'mock'}
        runKey={run?.seed}
        intro={
          mode === 'mock' ? (
            <p className="muted">
              The METR4202 paper at exam pace (1.5 min per mark): Section 1 MCQs, Section 2 short answers, Section 3 long answers. First answers
              count; hints unlock once every part of a problem is answered.
            </p>
          ) : (
            <p className="muted">Auto-marked items from every topic, weighted towards your weakest topics and anything you missed recently. One mark each.</p>
          )
        }
        title={mode === 'quick' ? 'Quick sprint' : 'Mock paper'}
        onFinish={(res, secs) => {
          const max = items.reduce((t, it) => t + it.marks, 0);
          const score = res.reduce((t, r) => t + (r ? r.score : 0), 0);
          recordSprint({ mode, score: Math.round(score * 10) / 10, max, secs });
          active = null;
        }}
      />
    </div>
  );
}
