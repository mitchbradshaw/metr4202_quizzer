// which-filter: "Which filter would you pick?" Scenario cards (KF, EKF, PF, EKF-SLAM, FastSLAM), each answered
// predict-then-reveal with a why per option; answering a card switches the plot to the belief that scenario
// produces and highlights its row of the comparison table (summary notes §2). The plot shows the true belief, the
// best single Gaussian a KF/EKF could carry (moment-matched) and a particle set of size M, so "one hypothesis only"
// and "particle deprivation" are visible, not just stated.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ExploreItem } from '../../../engine/types';
import { Area, Bars, Line, Plot, VLine, usePlot } from '../../../plot/Plot';
import { Button, Legend, More, Readout, Readouts, Segmented, Slider, Toggle } from '../../../ui/kit';
import { PredictReveal } from '../../../ui/PredictReveal';
import { Rich } from '../../../ui/Rich';
import { completeChallenge, recordPrediction } from '../../../app/store';
import { FiltersLayout, Panel, niceTop, revealVisual } from './common';
import { BIN_W, SHAPES, SHAPE_IDS, X0, X1, curve, density, drawParticles, findSeed, fitStats, normalPdf, peak, type ShapeId } from './whichModel';
import { CARDS, TABLE, type ScenarioCard } from './whichCards';

const CHALLENGE = 'filters-which-all';

export const meta: Omit<ExploreItem, 'component'> = {
  id: 'which-filter',
  title: 'Which filter would you pick?',
  summary:
    'Nine scenario cards: pick KF, EKF or PF (or EKF-SLAM vs FastSLAM), then see why each option is right or wrong. Each answer switches the plot to the belief that scenario produces, drawn three ways (the true belief, the one Gaussian a KF or EKF can carry, and $M$ particles), and highlights the filter’s row in the comparison table.',
  notice:
    'Pick by the shape of the **belief**: one bump fits a Gaussian exactly (KF, or EKF if mildly nonlinear); several bumps put the Gaussian’s mean where the robot cannot be, and only particles can hold them, if there are enough of them.',
  challenge: { id: CHALLENGE, title: 'Get all nine scenario cards right in one round' },
  minutes: 10,
};

const pct = (x: number) => `${Math.round(100 * x)} %`;

/** Particle positions as ticks along the bottom of the plot (one path, cheap for 2000 particles). */
function Rug({ xs, M }: { xs: Float64Array; M: number }) {
  const { sx, y0, ih, clip } = usePlot();
  const base = y0 + ih;
  let d = '';
  const n = Math.min(M, xs.length);
  for (let i = 0; i < n; i++) d += `M${sx(xs[i]).toFixed(1)} ${base}v-8`;
  return <path d={d} stroke="var(--m1)" strokeWidth={1.2} opacity={n > 400 ? 0.3 : n > 60 ? 0.55 : 0.9} clipPath={`url(#${clip})`} pointerEvents="none" />;
}

/** "✗ no particle" above a hypothesis that lost all its particles (styled inline: .plot-note sets its own fill). */
function LostMark({ x, y }: { x: number; y: number }) {
  const { sx, sy } = usePlot();
  return (
    <text x={sx(x)} y={sy(y) - 8} textAnchor="middle" style={{ fill: 'var(--bad)', fontSize: 12, fontWeight: 650 }} pointerEvents="none">
      ✗ no particle
    </text>
  );
}

export default function WhichFilter() {
  const [shape, setShape] = useState<ShapeId>('skew');
  const [M, setM] = useState(200);
  const [seed, setSeed] = useState(7);
  const [showG, setShowG] = useState(true);
  const [showP, setShowP] = useState(true);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [active, setActive] = useState<string | null>(null);
  const leftRef = useRef<HTMLDivElement>(null);

  const sh = SHAPES[shape];
  const parts = useMemo(() => drawParticles(sh, seed), [sh, seed]);
  const st = useMemo(() => fitStats(sh, parts, M), [sh, parts, M]);
  const bel = useMemo(() => curve((x) => density(sh, x)), [sh]);
  const top = useMemo(() => peak(sh), [sh]);
  const gCurve = useMemo(() => curve((x) => normalPdf(x, st.gauss.mu, st.gauss.s2)), [st.gauss.mu, st.gauss.s2]);
  const yTop = niceTop(1.3 * top);
  const bars = useMemo(() => Array.from(st.hist, (h, b) => ({ x: X0 + (b + 0.5) * BIN_W, y: h })), [st.hist]);
  const empty = st.counts.map((k, i) => (k === 0 ? i : -1)).filter((i) => i >= 0);

  const answered = CARDS.filter((c) => answers[c.id] !== undefined);
  const right = answered.filter((c) => c.options[answers[c.id]].correct).length;
  const activeCard = CARDS.find((c) => c.id === active) ?? null;
  const hotRow = activeCard?.options.find((o) => o.correct)?.row;
  const pickIdx = activeCard ? answers[activeCard.id] : undefined;
  const missRow = activeCard && pickIdx !== undefined && !activeCard.options[pickIdx].correct ? activeCard.options[pickIdx].row : undefined;

  // On a short screen the sticky column scrolls inside itself: bring the highlighted row into view there
  // (only that column scrolls, never the page).
  useEffect(() => {
    const box = leftRef.current;
    const row = box?.querySelector('tr.is-hot') as HTMLElement | null;
    if (!box || !row) return;
    const b = box.getBoundingClientRect();
    const r = row.getBoundingClientRect();
    if (r.bottom > b.bottom) box.scrollTop += r.bottom - b.bottom + 8;
    else if (r.top < b.top) box.scrollTop -= b.top - r.top + 8;
  }, [active, hotRow]);

  const pick = (card: ScenarioCard, i: number) => {
    if (answers[card.id] !== undefined) return;
    const next = { ...answers, [card.id]: i };
    setAnswers(next);
    setActive(card.id);
    setShape(card.shape);
    recordPrediction(`filters-which-${card.id}`, card.options[i].correct);
    if (CARDS.every((c) => next[c.id] !== undefined && c.options[next[c.id]].correct)) completeChallenge(CHALLENGE);
  };
  const showCard = (card: ScenarioCard) => {
    setActive(card.id);
    setShape(card.shape);
  };
  const choose = (s: ShapeId) => {
    setShape(s);
    setActive(null);
  };
  const look = () => revealVisual(leftRef.current);

  // ---------------------------------------------------------------- what the plot says
  const g = st.gauss;
  const verdict: string[] = [];
  if (st.atMean < 0.05)
    verdict.push(`The Gaussian’s mean $\\mu$ = ${g.mu.toFixed(1)} m is a place the robot **cannot be** (the true belief there is ${pct(st.atMean)} of its peak): a KF or EKF would be confidently wrong.`);
  else if (st.gaussMatch > 0.97) verdict.push('One Gaussian **is** this belief: a KF holds it exactly with two numbers, while the particles only approximate it.');
  else verdict.push(`The Gaussian catches the bulk but not the shape (${pct(st.gaussMatch)} shared area): fine for an EKF if the belief stays one bump.`);
  if (showP && empty.length)
    verdict.push(
      `**${empty.length === 1 ? 'One hypothesis holds' : `${empty.length} hypotheses hold`} no particle** (at ${empty.map((i) => `${sh.comps[i].mu.toFixed(1)} m`).join(', ')}): to the filter it is now impossible, and resampling can never bring it back.`
    );

  const left = (
    <>
      <Panel title="What each filter can hold" aside={activeCard ? <span className="filters-caption">belief for: <strong>{activeCard.title}</strong></span> : undefined}>
        <div className="filters-stack">
          <div className="filters-row">
            <span className="filters-label">True belief</span>
            <Segmented size="sm" label="True belief shape" value={shape} onChange={choose} options={SHAPE_IDS.map((id) => ({ value: id, label: SHAPES[id].label, title: SHAPES[id].title }))} />
          </div>
          <Plot
            x={{ min: X0, max: X1, label: 'position along the corridor x (m)' }}
            y={{ min: 0, max: yTop, label: 'bel(x) (1/m)' }}
            height={200}
            ariaLabel={`True belief (${sh.title}), the best single Gaussian and ${M} particles`}
          >
            <Area points={bel} color="var(--text-3)" opacity={0.25} />
            {showP && (
              <g opacity={0.42}>
                <Bars bars={bars} width={BIN_W * 0.9} />
              </g>
            )}
            <Line points={bel} color="var(--text-2)" width={1.6} />
            {showG && <Line points={gCurve} color="var(--m3)" width={2.6} />}
            {showG && <VLine x={g.mu} color="var(--m3)" label="μ" />}
            {showP && <Rug xs={parts} M={M} />}
            {showP && empty.map((i) => <LostMark key={i} x={sh.comps[i].mu} y={density(sh, sh.comps[i].mu)} />)}
          </Plot>
          <Legend
            items={[
              { label: 'true belief (exact Bayes filter)', color: 'var(--text-2)' },
              { label: 'one Gaussian (KF / EKF)', color: 'var(--m3)' },
              { label: `${M} particles (PF): histogram + ticks`, color: 'var(--m1)' },
            ]}
          />
          <div className="filters-row">
            <Toggle checked={showG} onChange={setShowG} label="Gaussian" />
            <Toggle checked={showP} onChange={setShowP} label="Particles" />
            <div style={{ flex: '1 1 220px', minWidth: 200 }}>
              <Slider label="particles" tex="M" tip="number of particles" value={M} min={5} max={2000} step={1} log onChange={(v) => setM(Math.round(v))} format={(v) => String(Math.round(v))} />
            </div>
            <Button size="sm" onClick={() => setSeed((s) => s + 1)} title="Draw a fresh particle set">
              Redraw
            </Button>
          </div>
          <Readouts min={112}>
            <Readout label="Gaussian fit" text={pct(st.gaussMatch)} tip="Shared area ∫ min(bel, Gaussian) dx: 100 % means the Gaussian is the belief" />
            <Readout label="particle fit" text={showP ? pct(st.pfMatch) : '—'} tip="Shared area ∫ min(bel, particle histogram) dx" />
            <Readout label="bel at μ" text={`${pct(st.atMean)} of peak`} tone={st.atMean < 0.05 ? 'bad' : undefined} tip="The true belief at the Gaussian’s mean, as a share of its peak: how plausible the KF’s best guess is" />
            <Readout label="bumps lost" text={`${empty.length} of ${sh.comps.length}`} tone={empty.length ? 'bad' : undefined} tip="Hypotheses (bumps) with no particle within 2.5 σ of their centre" />
            <Readout label="numbers kept" text={`2 vs ${M}`} tip="A 1-D Gaussian needs μ and σ²; a PF keeps one position per particle" />
          </Readouts>
          <div className="filters-note">
            <Rich text={`${sh.story} ${verdict.join(' ')}`} />
          </div>
        </div>
      </Panel>
      <Panel title="KF vs EKF vs PF" aside={<span className="filters-caption">{activeCard ? <>highlighted: the right filter for <strong>{activeCard.title}</strong>{missRow && missRow !== hotRow ? <> · red: your pick</> : null}</> : 'answer a card to highlight its row'}</span>}>
        <div className="filters-table-wrap">
          <table className="filters-table">
            <thead>
              <tr>
                <th>Filter</th>
                <th>Belief</th>
                <th>Models allowed</th>
                <th>Good for</th>
                <th>Weak spot</th>
              </tr>
            </thead>
            <tbody>
              {TABLE.map((r) => (
                <tr key={r.id} className={r.id === hotRow ? 'is-hot' : r.id === missRow ? 'is-miss' : undefined}>
                  <td>
                    <strong>{r.name}</strong>
                    {r.id === hotRow ? ' ✓' : r.id === missRow ? ' ✗' : ''}
                  </td>
                  <td>
                    <Rich text={r.belief} inline />
                  </td>
                  <td>
                    <Rich text={r.models} inline />
                  </td>
                  <td>
                    <Rich text={r.good} inline />
                  </td>
                  <td>
                    <Rich text={r.weak} inline />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );

  const right_ = (
    <>
      <Panel
        title="Scenario cards"
        aside={
          <span className="filters-score">
            {right}/{answered.length} right{answered.length < CARDS.length ? ` · ${CARDS.length - answered.length} to go` : ''}
          </span>
        }
      >
        <div className="filters-cards">
          {CARDS.map((c) => {
            const p = answers[c.id];
            const done = p !== undefined;
            const ok = done && c.options[p].correct;
            return (
              <div key={c.id} className={`filters-card ${done ? (ok ? 'is-done' : 'is-miss') : ''}`}>
                <div className="filters-card-head">
                  <h4>{c.title}</h4>
                  {done && (
                    <Button size="sm" variant="ghost" onClick={() => showCard(c)}>
                      {active === c.id ? 'shown in the plot' : 'show its belief'}
                    </Button>
                  )}
                </div>
                <Rich text={c.text} />
                <div className="filters-opts" role="group" aria-label={`Which filter for: ${c.title}`}>
                  {c.options.map((o, i) => (
                    <button key={i} type="button" className={`filters-opt ${done ? (o.correct ? 'is-right' : i === p ? 'is-wrong' : '') : ''}`} disabled={done} onClick={() => pick(c, i)}>
                      <Rich text={o.label} inline />
                    </button>
                  ))}
                </div>
                {done && (
                  <div className="filters-whys" aria-live="polite">
                    {c.options.map((o, i) => (
                      <div key={i} className={o.correct ? 'is-right' : i === p ? 'is-wrong' : ''}>
                        <Rich text={`**${o.label}${o.correct ? ' (right)' : i === p ? ' (your pick)' : ''}:** ${o.why}`} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {answered.length > 0 && (
          <div className="filters-row" style={{ marginTop: 10 }}>
            <Button
              size="sm"
              onClick={() => {
                setAnswers({});
                setActive(null);
              }}
            >
              Reset the cards
            </Button>
            {answered.length === CARDS.length && <span className="filters-score">{right === CARDS.length ? 'All nine right.' : `${right} of ${CARDS.length}: reset and try again for a clean round.`}</span>}
          </div>
        )}
      </Panel>
      <Panel title="Predict, then check">
        <div className="filters-predicts">
          <PredictReveal
            id="filters-which-mean"
            question="Two identical doors: the robot has just seen a door, so the true belief has two equal bumps, at 2.5 m and 7.5 m. Where is the mean of the best single Gaussian, the most a KF or EKF can carry?"
            options={['At 2.5 m, the first door', 'At 5 m, between the doors, where the robot cannot be', 'It keeps two means, one per door', 'At 7.5 m, the door seen last']}
            answer={1}
            explain="A Gaussian has one mean. The best one (same mean and variance as the true belief) sits at $\mu$ = 5 m with $\sigma \approx$ 2.5 m: it is most confident exactly where the robot cannot be. Particles simply sit at both doors. This is why a KF or EKF cannot do global localisation."
            tryIt="Pick **2 doors** and watch the Gaussian (KF / EKF) curve and its $\mu$ line."
            onApply={() => {
              choose('two');
              setShowG(true);
              setShowP(true);
              setM(500);
              look();
            }}
          />
          <PredictReveal
            id="filters-which-rare"
            question="Three places fit the readings, with probabilities 0.6, 0.3 and 0.1. With only $M$ = 10 particles, what can happen to the 0.1 hypothesis?"
            options={['Nothing: it always keeps exactly one particle', 'It can end up with no particle at all, and then it can never come back', 'It grows, because rare hypotheses get larger weights', 'It merges into the nearest bump']}
            answer={1}
            explain="Each particle lands on the 0.1 bump with probability 0.1, so with $M$ = 10 there is a $0.9^{10} \approx$ 35 % chance that none does. A hypothesis with no particle has probability zero as far as the filter is concerned, and resampling only copies particles that exist: **particle deprivation**. Hence random-particle injection for the kidnapped robot, and enough particles in the first place."
            tryIt="Pick **1 rare**, slide $M$ down to 10 and press Redraw a few times."
            onApply={() => {
              const s = findSeed(SHAPES.rare, 10, (c) => c[2] === 0 && c[0] > 0 && c[1] > 0, 11);
              choose('rare');
              setShowP(true);
              setM(10);
              setSeed(s);
              look();
            }}
          />
          <PredictReveal
            id="filters-which-cost"
            question="Tracking from a known start with linear models: the belief is one bump. Which representation holds it best?"
            options={['The Gaussian: exactly, with just $\\mu$ and $\\sigma^2$', 'The particles: they are always more accurate', 'Both are equally exact, whatever $M$ is', 'Neither: one bump needs a mixture']}
            answer={0}
            explain="One bump **is** a Gaussian, so the KF holds it exactly with two numbers (in $n$ dimensions, $n$ means and $n(n+1)/2$ covariances). Twenty particles give a ragged histogram, and it takes hundreds to look as good: the PF pays for flexibility the problem does not need. Use the simplest filter whose assumptions hold."
            tryIt="Pick **1 bump** with $M$ = 20, then slide $M$ up and watch the particles' shared area creep towards 100 %."
            onApply={() => {
              choose('one');
              setShowG(true);
              setShowP(true);
              setM(20);
              setSeed(7);
              look();
            }}
          />
        </div>
      </Panel>
      <More label="Why the Gaussian here is the best a KF can do, and what changes in more dimensions">
        <Rich
          text={
            'The Gaussian drawn here is the **moment-matched** one: the same mean and variance as the true belief. No single Gaussian is closer to it in the sense a Kalman filter cares about, so whatever a KF or EKF does, its belief can look no better than this; a real EKF is usually worse, because linearising also biases the mean (see the EKF simulation).\n\nIn more dimensions the gap grows. A Gaussian over a 3-D pose $(x, y, \\theta)$ needs 3 means and 6 covariances, 9 numbers. Particles must cover the volume the belief occupies, so the number needed grows roughly exponentially with the dimension: fine for a 3-D pose, hopeless for a full map, which is why FastSLAM samples only the path and gives each particle small landmark EKFs.'
          }
        />
      </More>
    </>
  );

  return <FiltersLayout leftRef={leftRef} left={left} right={right_} />;
}
