// Home: the topic selector (grouped on the see–think–act loop), a progress overview per topic, the
// "do these first" templates that recur every year, and entry points to review and the sprints.
import { useMemo } from 'react';
import { TOPICS, challengeIds, topicByCode } from '../topics';
import { PART_SHORT, type TopicCode } from '../engine/codes';
import type { TopicDef } from '../engine/types';
import { boxCounts, dueCounts, mastery, storageAvailable, streak, useProgress, type Progress } from '../app/store';
import { href } from '../app/router';
import { Badge, Callout, LinkButton, MasteryRing, ProgressBar } from '../ui/kit';
import { Rich } from '../ui/Rich';

const PAPER = [
  { part: 'Section 1', marks: '20', what: '20 multiple-choice questions, one per mark: definitions and “which is FALSE” traps across all nine topics.' },
  { part: 'Section 2', marks: '20', what: 'Short answers (1–5 marks): the two Bayes-filter steps, data association and loop closure, C-space labelling, a sensor comparison, an RL concept, implicit vs explicit coordination.' },
  { part: 'Section 3', marks: '40', what: 'Three long answers, the same templates every year: a discrete Bayes or occupancy update, planning by hand (A*, RRT vs RRT*, velocity model), and an arm question (M, screw axes, then a pinhole calculation).' },
];

/** The recurring templates, worth about 45 of the 80 marks. Links to the exam-mode generators that drill them. */
const FIRST: { title: string; marks: string; why: string; links: { topic: TopicCode; gen: string; label: string }[] }[] = [
  {
    title: 'Discrete Bayes or occupancy update',
    marks: '10–15 marks',
    why: 'Prediction then a prior × likelihood table. 2023 occupancy cell, 2024 grid world, 2025 fruit classifier.',
    links: [
      { topic: 'bayes', gen: 'bayes-grid', label: 'Grid-world localisation' },
      { topic: 'bayes', gen: 'bayes-classifier', label: 'Classifier + gripper choice' },
      { topic: 'slam', gen: 'slam-occupancy', label: 'Occupancy cell' },
    ],
  },
  {
    title: 'Planning by hand',
    marks: '10–15 marks',
    why: 'Open/Closed tables for A*, RRT vs RRT* parent and rewire, velocity-model steering.',
    links: [
      { topic: 'plan', gen: 'plan-astar', label: 'A* on a road map' },
      { topic: 'plan', gen: 'plan-rrtstar', label: 'RRT vs RRT*' },
      { topic: 'plan', gen: 'plan-steer', label: 'RRT steering with the velocity model' },
    ],
  },
  {
    title: 'Arm + camera',
    marks: '15 marks',
    why: 'Read the frames, write M, fill the screw-axis table, then a pinhole calculation from the end-effector camera.',
    links: [
      { topic: 'kin', gen: 'kin-m', label: 'Build M' },
      { topic: 'kin', gen: 'kin-screws', label: 'Screw-axis table' },
      { topic: 'vision', gen: 'vision-pinhole', label: 'Pinhole camera' },
    ],
  },
  {
    title: 'C-space labelling',
    marks: '3–5 marks',
    why: 'Match each obstacle to its C-space region: link-1 bands vs link-2 blobs.',
    links: [{ topic: 'plan', gen: 'plan-cspace', label: 'Label the C-space' }],
  },
];

function topicStats(p: Progress, t: TopicDef) {
  const boxes = boxCounts(p, t.flashcards);
  const learned = boxes.slice(3).reduce((a, b) => a + b, 0);
  const tries = p.attempts[t.code] ?? [];
  const solves = tries.filter((a) => a.kind === 'solve');
  const quiz = tries.filter((a) => a.kind === 'quiz');
  return {
    learned,
    cards: t.flashcards.length,
    solveOk: solves.filter((a) => a.ok).length,
    solveN: solves.length,
    quizOk: quiz.filter((a) => a.ok).length,
    quizN: quiz.length,
    sims: t.explore.length,
    challengesDone: challengeIds(t).filter((id) => p.challenges[id]).length,
    challenges: challengeIds(t).length,
  };
}

export function Home() {
  const p = useProgress();
  const allCards = useMemo(() => TOPICS.flatMap((t) => t.flashcards), []);
  const { due, unseen } = dueCounts(p, allCards);
  const st = streak(p);
  const hitTraps = Object.values(p.traps).filter((t) => t.hits > 0).length;
  const beaten = Object.values(p.traps).filter((t) => t.beaten > 0).length;
  const acc = p.session.done ? Math.round((100 * p.session.correct) / p.session.done) : null;

  return (
    <div className="home">
      {!storageAvailable() && (
        <Callout kind="warn" title="Progress is not being saved">
          This browser is blocking local storage (e.g. a private window), so your progress lasts only until you close the page. Use ⚙ Settings → Export
          progress to keep it.
        </Callout>
      )}
      <section className="hero">
        <div>
          <h1>METR4202 Robotics Lab</h1>
          <p className="lede">
            Move a slider and watch a belief, filter, planner or arm respond. Predict before you look. Then solve the exam’s templates step by step, with every
            step checked.
          </p>
        </div>
        <div className="stats">
          <div className="stat">
            <div className="stat-num">{st}</div>
            <div className="stat-label">day streak</div>
          </div>
          <a className="stat" href="#/review">
            <div className="stat-num">{due}</div>
            <div className="stat-label">cards due · {unseen} new</div>
          </a>
          <a className="stat" href="#/session">
            <div className="stat-num">{p.session.done}</div>
            <div className="stat-label">this session{acc !== null ? ` · ${acc}% right` : ''}</div>
          </a>
          <a className="stat" href="#/traps">
            <div className="stat-num">
              {beaten}/{hitTraps}
            </div>
            <div className="stat-label">traps beaten</div>
          </a>
        </div>
      </section>

      <section className="actions">
        <LinkButton href="#/review" variant="primary">
          Mixed review{due ? ` · ${due} due` : ''}
        </LinkButton>
        <LinkButton href="#/sprint/quick">Quick sprint · 20 min</LinkButton>
        <LinkButton href="#/sprint/mock">Mock paper · 120 min</LinkButton>
      </section>

      <section className="card first">
        <h2 className="card-title">Do these first: the templates that recur every year</h2>
        <p className="muted small">About 45 of the 80 marks come from these four. Practise them until they are mechanical.</p>
        <div className="first-grid">
          {FIRST.map((f) => (
            <div key={f.title} className="first-item">
              <div className="row between gap-s">
                <strong>{f.title}</strong>
                <Badge tone="accent">{f.marks}</Badge>
              </div>
              <p className="small">{f.why}</p>
              <div className="row gap-s wrap">
                {f.links.map((l) => {
                  const t = topicByCode(l.topic);
                  const exists = !!t?.solve.some((g) => g.id === l.gen);
                  return (
                    <a key={l.gen} className="btn btn-default btn-sm" href={exists ? href([l.topic, 'solve', l.gen]) : href([l.topic, 'solve'])}>
                      {l.label} →
                    </a>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="part">
        <h2 className="part-title">Topics (in the order of the summary notes)</h2>
        <div className="topic-grid">
              {TOPICS.map((t) => {
                const m = mastery(p, t.code, challengeIds(t));
                const s = topicStats(p, t);
                return (
                  <a key={t.code} className="topic-tile" href={href(t.code)}>
                    <div className="tile-head">
                      <span className="tile-code">
                        §{t.num} <span className={`stage stage-${t.part}`}>{PART_SHORT[t.part]}</span>
                      </span>
                      <MasteryRing value={m.value} n={m.n} />
                    </div>
                    <div className="tile-title">{t.title}</div>
                    <div className="tile-blurb">
                      <Rich text={t.blurb} inline />
                    </div>
                    <div className="tile-meta">{t.exam && <Badge tone="accent">{t.exam}</Badge>}</div>
                    <div className="tile-progress">
                      <div className="tile-progress-row">
                        <span>Flashcards learned</span>
                        <span className="mono">
                          {s.learned}/{s.cards}
                        </span>
                      </div>
                      <ProgressBar value={s.learned} max={Math.max(1, s.cards)} label={`${t.title}: flashcards learned`} />
                      <div className="tile-progress-row small muted">
                        <span>
                          Problems {s.solveOk}/{s.solveN} right · MCQs {s.quizOk}/{s.quizN}
                          {s.challenges ? ` · challenges ${s.challengesDone}/${s.challenges}` : ''}
                        </span>
                      </div>
                    </div>
                    <div className="tile-counts">
                      {t.explore.length} sims · {t.solve.length} problem types · {t.mcqs.length} MCQs · {t.cards.length} cards
                    </div>
                  </a>
                );
              })}
        </div>
      </section>

      <section className="paper card">
        <h3 className="card-title">The paper at a glance (120 min + 10 min planning, 80 marks, 40% hurdle)</h3>
        <table className="table">
          <tbody>
            {PAPER.map((r) => (
              <tr key={r.part}>
                <th>{r.part}</th>
                <td className="mono">{r.marks}</td>
                <td>{r.what}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="muted small">
          Exam pace is 1.5 minutes per mark. Habits that earn marks: show the table at every step (Open/Closed, prior × likelihood), carry four significant
          figures, use radians, check that probabilities sum to 1 and that R is right-handed (det R = +1).
        </p>
      </section>
    </div>
  );
}
