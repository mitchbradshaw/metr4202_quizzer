// Grid-world localisation (grid2d): the 2024 Q28 problem, editable. Click tiles to change their colour or mark
// the possible starting tiles, edit the action's transition stencil and the camera model, then step Predict and
// Correct. The board shows the belief as circles (area ∝ probability); beside it are the exact hand-working
// tables: each start's contributions (which add on a shared tile), and prior × likelihood = product, Σ = P(z),
// product ÷ P(z) = posterior. "Exam preset" reproduces the 2024 worked solution.
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ExploreItem } from '../../../engine/types';
import { MAP_2024_Q28, cellLabel, type ColourSensor, type MoveOutcome, type Tile, type TileMap } from '../../../core/gridloc';
import { beliefOn, gridCorrectTable, gridPredictTable, ranked, type CorrectTable, type PredictTable } from '../../../core/bayestables';
import type { Belief } from '../../../core/gridloc';
import { Button, More, Readout, Readouts, Segmented, Slider } from '../../../ui/kit';
import { PredictReveal } from '../../../ui/PredictReveal';
import { Rich } from '../../../ui/Rich';
import { useRaf } from '../../../anim/hooks';
import { BayesLayout, HandTable, Panel, f2, f4, revealVisual, useTween } from './common';
import { Stencil, TB, TileBoard, inkOn, tbCx, tbCy, tbY } from './tileBoard';
import { moveName } from '../solve/common';

export const meta: Omit<ExploreItem, 'component'> = {
  id: 'grid2d',
  title: 'Grid-world localisation (2024 Q28), editable',
  summary:
    'The exam’s black-and-white tile map: mark the possible starting tiles, edit the action’s slip probabilities and the camera model, then step **Predict** and **Correct** with the exact hand-working tables beside the board.',
  notice:
    'Prediction moves probability without looking at colours (and adds it up where two starts land on the same tile); correction then shifts it onto tiles of the colour the camera saw, in proportion to $P(z \\mid x)$.',
  minutes: 10,
};

type Stencil3 = number[][]; // [dr + 1][dc + 1]

const EXAM_STENCIL: Stencil3 = [
  [0.2, 0.8, 0],
  [0, 0, 0],
  [0, 0, 0],
];
const STENCILS: { id: string; label: string; s: Stencil3 }[] = [
  { id: 'exam', label: 'Up 0.8, up-left 0.2 (exam)', s: EXAM_STENCIL },
  { id: 'exact', label: 'Up, exact', s: [[0, 1, 0], [0, 0, 0], [0, 0, 0]] },
  { id: 'both', label: 'Up 0.7, slips 0.15 either side', s: [[0.15, 0.7, 0.15], [0, 0, 0], [0, 0, 0]] },
  { id: 'stay', label: 'Right 0.8, stays 0.2', s: [[0, 0, 0], [0, 0.2, 0.8], [0, 0, 0]] },
];
const EXAM_SENSOR: ColourSensor = { pBlackGivenBlack: 0.83, pWhiteGivenWhite: 0.9 };
const EXAM_STARTS = [
  { c: 2, r: 2 },
  { c: 6, r: 3 },
];

function movesOf(s: Stencil3): MoveOutcome[] {
  const out: MoveOutcome[] = [];
  let total = 0;
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) total += Math.max(0, s[r][c]);
  if (total <= 0) return [{ dc: 0, dr: 0, p: 1 }];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) if (s[r][c] > 0) out.push({ dc: c - 1, dr: r - 1, p: s[r][c] / total });
  return out.sort((a, b) => b.p - a.p);
}

const cloneMap = (m: TileMap): TileMap => ({ cols: m.cols, rows: m.rows, tiles: m.tiles.map((row) => row.slice() as Tile[]) });
const colour = (t: Tile) => (t === 1 ? 'black' : 'white');

type Step = { kind: 'predict'; table: PredictTable } | { kind: 'correct'; table: CorrectTable; z: Tile };
interface Snap {
  bel: Belief;
  step: Step | null;
}

const R_MAX = 17;
const radius = (p: number) => (p > 0 ? Math.max(2.2, R_MAX * Math.sqrt(Math.min(1, p))) : 0);

export default function GridWorld() {
  const [map, setMap] = useState<TileMap>(() => cloneMap(MAP_2024_Q28));
  const [starts, setStarts] = useState<{ c: number; r: number }[]>(EXAM_STARTS);
  const [stencil, setStencil] = useState<Stencil3>(EXAM_STENCIL);
  const [sensor, setSensor] = useState<ColourSensor>(EXAM_SENSOR);
  const [z, setZ] = useState<Tile>(0);
  const [mode, setMode] = useState<'colour' | 'start'>('colour');
  const [hist, setHist] = useState<Snap[]>(() => [{ bel: beliefOn(MAP_2024_Q28, EXAM_STARTS), step: null }]);
  const leftRef = useRef<HTMLDivElement>(null);
  const tween = useTween();
  const queue = useRef<('p' | 'c')[]>([]);
  const busyUntil = useRef(0);
  const [, force] = useState(0);

  const moves = useMemo(() => movesOf(stencil), [stencil]);
  const stencilSum = stencil.flat().reduce((a, b) => a + Math.max(0, b), 0);
  const snap = hist[hist.length - 1];
  const step = snap.step;
  const lastPredict = [...hist].reverse().find((s) => s.step?.kind === 'predict')?.step as Extract<Step, { kind: 'predict' }> | undefined;
  const lastCorrect = [...hist].reverse().find((s) => s.step?.kind === 'correct')?.step as Extract<Step, { kind: 'correct' }> | undefined;

  // Refs so that queued steps use the latest settings.
  const live = useRef({ map, moves, sensor, z });
  live.current = { map, moves, sensor, z };

  const restart = (m = map, st = starts) => {
    queue.current = [];
    setHist([{ bel: beliefOn(m, st), step: null }]);
  };
  const predict = () =>
    setHist((h) => {
      const s = h[h.length - 1];
      const table = gridPredictTable(live.current.map, s.bel, live.current.moves);
      return [...h, { bel: table.predicted, step: { kind: 'predict', table } }];
    });
  const correct = (zz: Tile = live.current.z) =>
    setHist((h) => {
      const s = h[h.length - 1];
      const table = gridCorrectTable(live.current.map, s.bel, zz, live.current.sensor, orderOf(h));
      if (!(table.evidence > 0)) return h;
      return [...h, { bel: table.posterior, step: { kind: 'correct', table, z: zz } }];
    });
  const back = () => setHist((h) => (h.length > 1 ? h.slice(0, -1) : h));

  useRaf(
    () => {
      const now = performance.now();
      if (now < busyUntil.current) return;
      const a = queue.current.shift();
      if (!a) return;
      busyUntil.current = now + 1150;
      if (a === 'p') predict();
      else correct();
    },
    queue.current.length > 0
  );
  const runQueue = (acts: ('p' | 'c')[]) => {
    queue.current = acts;
    busyUntil.current = performance.now() + 250;
    force((x) => x + 1);
  };

  const onCell = (c: number, r: number) => {
    if (mode === 'colour') {
      const m = cloneMap(map);
      m.tiles[r][c] = m.tiles[r][c] === 1 ? 0 : 1;
      setMap(m);
      // Colours only matter to the correction, so keep the belief; redo the steps on the new map.
      setHist((h) => replay(m, h, live.current.moves, live.current.sensor));
    } else {
      const has = starts.some((s) => s.c === c && s.r === r);
      const st = has ? starts.filter((s) => !(s.c === c && s.r === r)) : [...starts, { c, r }].sort((a, b) => a.r - b.r || a.c - b.c);
      if (!st.length) return;
      setStarts(st);
      restart(map, st);
    }
  };

  const loadExam = () => {
    const m = cloneMap(MAP_2024_Q28);
    setMap(m);
    setStarts(EXAM_STARTS);
    setStencil(EXAM_STENCIL);
    setSensor(EXAM_SENSOR);
    setZ(0);
    live.current = { map: m, moves: movesOf(EXAM_STENCIL), sensor: EXAM_SENSOR, z: 0 };
    restart(m, EXAM_STARTS);
  };
  const setup = (fn: () => void) => {
    fn();
    revealVisual(leftRef.current);
  };

  // ---------------------------------------------------------------- animation of the newest step
  const circleRefs = useRef<Map<string, SVGCircleElement | null>>(new Map());
  const pieceRefs = useRef<(SVGGElement | null)[]>([]);
  const animated = useRef<Snap | null>(null);
  const prevBel = hist.length > 1 ? hist[hist.length - 2].bel : null;
  useLayoutEffect(() => {
    if (animated.current === snap) return;
    animated.current = snap;
    if (!step || !prevBel) return;
    busyUntil.current = Math.max(busyUntil.current, performance.now() + 900);
    if (step.kind === 'predict') {
      const ks = step.table.contributions.filter((k) => k.toC >= 0);
      tween(900, (p) => {
        const move = Math.min(1, p / 0.75);
        ks.forEach((k, j) => {
          const g = pieceRefs.current[j];
          if (!g) return;
          const x = tbCx(k.fromC) + (tbCx(k.toC) - tbCx(k.fromC)) * move;
          const y = tbCy(k.fromR) - 3 + (tbCy(k.toR) - tbCy(k.fromR)) * move;
          g.setAttribute('transform', `translate(${x} ${y})`);
          g.setAttribute('opacity', String(p < 0.85 ? 1 : (1 - p) / 0.15));
        });
        circleRefs.current.forEach((el) => el?.setAttribute('opacity', String(Math.max(0, (p - 0.7) / 0.3))));
      });
    } else {
      const rows = step.table.rows;
      tween(900, (p) => {
        for (const row of rows) {
          const el = circleRefs.current.get(`${row.c},${row.r}`);
          if (el) el.setAttribute('r', String(radius(row.prior + (row.post - row.prior) * p)));
        }
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snap]);

  // ---------------------------------------------------------------- board overlay
  const cells = ranked(snap.bel);
  const best = cells[0];
  const overlay = (
    <g>
      {mode === 'start' &&
        starts.map((s) => (
          <rect key={`s${s.c},${s.r}`} x={tbCx(s.c) - TB.cell / 2 + 3} y={tbY(s.r) + 3} width={TB.cell - 6} height={TB.cell - 6} fill="none" stroke="var(--accent)" strokeWidth={2.5} strokeDasharray="5 3" />
        ))}
      {step?.kind === 'predict' &&
        step.table.contributions
          .filter((k) => k.toC >= 0 && (k.toC !== k.fromC || k.toR !== k.fromR))
          .map((k, j) => {
            const x1 = tbCx(k.fromC);
            const y1 = tbCy(k.fromR);
            const x2 = tbCx(k.toC);
            const y2 = tbCy(k.toR);
            const len = Math.hypot(x2 - x1, y2 - y1);
            const ux = (x2 - x1) / len;
            const uy = (y2 - y1) / len;
            const ex = x2 - ux * 12;
            const ey = y2 - uy * 12;
            return (
              <g key={`a${j}`} opacity={0.75}>
                <line x1={x1 + ux * 10} y1={y1 + uy * 10} x2={ex} y2={ey} stroke="var(--m2)" strokeWidth={1.6} />
                <path d={`M${ex + ux * 5} ${ey + uy * 5} L${ex - ux * 2 - uy * 4} ${ey - uy * 2 + ux * 4} L${ex - ux * 2 + uy * 4} ${ey - uy * 2 - ux * 4} Z`} fill="var(--m2)" />
              </g>
            );
          })}
      {cells.map((cell) => {
        const black = map.tiles[cell.r][cell.c] === 1;
        return (
          <g key={`b${cell.c},${cell.r}`}>
            <circle
              ref={(el) => {
                circleRefs.current.set(`${cell.c},${cell.r}`, el);
              }}
              cx={tbCx(cell.c)}
              cy={tbCy(cell.r) - 3}
              r={radius(cell.p)}
              fill="var(--m1)"
              fillOpacity={0.88}
              stroke={black ? 'var(--bayes-white)' : 'var(--surface)'}
              strokeWidth={1.2}
            />
            <text x={tbCx(cell.c)} y={tbY(cell.r) + TB.cell - 3} textAnchor="middle" className="bayes-board-small" fill={inkOn(black)}>
              {Number(cell.p.toFixed(4))}
            </text>
          </g>
        );
      })}
      {step?.kind === 'predict' &&
        step.table.contributions
          .filter((k) => k.toC >= 0)
          .map((k, j) => (
            <g
              key={`p${j}`}
              ref={(el) => {
                pieceRefs.current[j] = el;
              }}
              transform={`translate(${tbCx(k.toC)} ${tbCy(k.toR) - 3})`}
              opacity={0}
            >
              <circle r={radius(k.mass)} fill="var(--m2)" fillOpacity={0.75} stroke="var(--surface)" strokeWidth={1} />
            </g>
          ))}
    </g>
  );

  // ---------------------------------------------------------------- render
  const zName = colour(z);
  const left = (
    <div ref={leftRef} className="bayes-panel bayes-left-stack">
      <div className="bayes-row">
        <span className="bayes-label">Click a tile to</span>
        <Segmented
          size="sm"
          label="What a click on a tile does"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'colour', label: 'flip its colour' },
            { value: 'start', label: 'mark a start tile' },
          ]}
        />
        <Button size="sm" onClick={loadExam} title="2024 Q28: C3 or G4, up 0.8 / up-left 0.2, camera 0.83 / 0.90">
          Exam preset (2024 Q28)
        </Button>
      </div>
      <TileBoard
        map={map}
        onCell={onCell}
        ariaLabel={`Tile map ${map.cols} by ${map.rows}. Belief: ${cells
          .slice(0, 6)
          .map((c) => `${c.label} ${c.p.toFixed(3)}`)
          .join(', ')}`}
        cellTitle={(c, r) => `${cellLabel(c, r)} (${colour(map.tiles[r][c])}): ${mode === 'colour' ? 'click to flip its colour' : 'click to add or remove it as a start tile'}`}
      >
        {overlay}
      </TileBoard>
      <div className="bayes-actions">
        <Button variant="primary" onClick={predict} title="Prediction: push the belief through the action's transition probabilities">
          ▶ Predict (move)
        </Button>
        <Button className="bayes-suggest" onClick={() => correct()} title="Correction with the camera reading chosen on the right">
          Correct: camera sees {zName}
        </Button>
        <Segmented
          size="sm"
          label="Camera reading"
          value={z}
          onChange={(v: Tile) => setZ(v)}
          options={[
            { value: 0 as Tile, label: 'white' },
            { value: 1 as Tile, label: 'black' },
          ]}
        />
        <Button size="sm" onClick={back} disabled={hist.length < 2}>
          ◀ Back
        </Button>
        <Button size="sm" onClick={() => restart()}>
          ↺ Restart
        </Button>
      </div>
      <Rich
        className="small muted"
        text={`Circles: area ∝ probability (number under each). ${step ? (step.kind === 'predict' ? 'Orange arrows: where each start’s probability went in the last prediction.' : `Last step: correction with $z$ = ${colour(step.z)}.`) : 'Start: equal probability on the start tiles.'} Moves off the map leave the robot where it is.`}
      />
    </div>
  );

  const right = (
    <>
      <Panel title="The action and the camera">
        <div className="bayes-stencil-edit">
          <div>
            <div className="bayes-label">Transition probabilities (centre = start tile)</div>
            <div className="bayes-stencil-grid" role="group" aria-label="Transition stencil: probability of ending in each neighbouring tile">
              {stencil.map((row, r) =>
                row.map((v, c) => (
                  <input
                    key={`${r}${c}`}
                    className={`bayes-stencil-input ${v > 0 ? 'is-on' : ''} ${r === 1 && c === 1 ? 'is-centre' : ''}`}
                    type="number"
                    min={0}
                    max={1}
                    step={0.05}
                    value={Number(v.toFixed(3))}
                    aria-label={`P(${moveName(c - 1, r - 1)})`}
                    title={moveName(c - 1, r - 1)}
                    onChange={(e) => {
                      const val = Math.max(0, Math.min(1, Number(e.target.value) || 0));
                      setStencil((s) => s.map((rr, i) => rr.map((x, j) => (i === r && j === c ? val : x))));
                    }}
                  />
                ))
              )}
            </div>
            <div className={`small ${Math.abs(stencilSum - 1) > 1e-6 ? 'bayes-warn' : 'muted'}`}>
              Sum = {Number(stencilSum.toFixed(3))}
              {Math.abs(stencilSum - 1) > 1e-6 ? ' (must be 1: normalised for the calculation)' : ' ✓'}
            </div>
          </div>
          <div className="bayes-stencil-side">
            <Stencil moves={moves} size={104} />
            <div className="bayes-col-btns">
              {STENCILS.map((s) => (
                <Button key={s.id} size="sm" variant="ghost" onClick={() => setStencil(s.s)}>
                  {s.label}
                </Button>
              ))}
            </div>
          </div>
        </div>
        <Slider label="black tile" tex="P(\text{black} \mid \text{black})" tip="Probability the camera reports black when the robot is on a black tile" value={sensor.pBlackGivenBlack} min={0.5} max={1} step={0.01} onChange={(v) => setSensor((s) => ({ ...s, pBlackGivenBlack: v }))} />
        <Slider label="white tile" tex="P(\text{white} \mid \text{white})" tip="Probability the camera reports white when the robot is on a white tile" value={sensor.pWhiteGivenWhite} min={0.5} max={1} step={0.01} onChange={(v) => setSensor((s) => ({ ...s, pWhiteGivenWhite: v }))} />
        <Rich className="note" text={`So $P(\\text{white} \\mid \\text{black}) = 1 - ${f2(sensor.pBlackGivenBlack)} = ${f2(1 - sensor.pBlackGivenBlack)}$ and $P(\\text{black} \\mid \\text{white}) = ${f2(1 - sensor.pWhiteGivenWhite)}$: each row of the camera table sums to 1.`} />
      </Panel>

      <Panel title={lastPredict ? 'Prediction: contributions' : 'Prediction'} live>
        {lastPredict ? <PredictTableView t={lastPredict.table} /> : <p className="small muted">Press Predict to push the start probabilities through the action.</p>}
      </Panel>

      <Panel title={lastCorrect ? `Correction: the camera saw ${colour(lastCorrect.z)}` : 'Correction'} live>
        {lastCorrect ? (
          <>
            <HandTable
              zTex={`\\text{${colour(lastCorrect.z)}}`}
              priorTex="\overline{bel}(x)"
              postTex="bel(x)"
              rows={lastCorrect.table.rows.map((row) => ({
                key: row.label,
                label: `${row.label} (${colour(row.tile)})`,
                chip: row.tile === 1 ? 'var(--bayes-black)' : 'var(--bayes-white)',
                prior: row.prior,
                lik: row.lik,
                product: row.product,
                post: row.post,
              }))}
            />
            <Readouts min={130}>
              <Readout label={`P(z = ${colour(lastCorrect.z)})`} text={f4(lastCorrect.table.evidence)} tip="Evidence: the sum of the products" tone="m3" />
              <Readout label="η = 1/P(z)" text={f2(1 / lastCorrect.table.evidence)} tip="Normaliser" />
              <Readout label="Most likely" text={best ? `${best.label}: ${f4(best.p)}` : '—'} tip="The tile with the largest posterior" tone="m1" />
            </Readouts>
          </>
        ) : (
          <p className="small muted">After a prediction, press Correct: the table appears here, row by row as in the worked solutions.</p>
        )}
      </Panel>

      <Panel title="Predict, then check" className="bayes-predicts">
        <PredictReveal
          id="bayes-grid2d-exam"
          question="2024 Q28: C3 or G4 (0.5 each), action up (0.8 up, 0.2 up-left), camera 0.83 / 0.90. The camera sees **white**. Which tile is now most likely?"
          options={['C2', 'G3', 'F3', 'B2']}
          answer={1}
          explain="After the move C2 and G3 hold 0.4 each, B2 and F3 0.1. C2 and B2 are black, so seeing white is unlikely there ($P(\text{white} \mid \text{black}) = 1 - 0.83 = 0.17$); G3 and F3 are white (0.90). $P(\text{white}) = 0.17(0.4) + 0.17(0.1) + 0.9(0.4) + 0.9(0.1) = 0.535$, and **G3 = 0.36/0.535 = 0.6729** is the most likely (C2 0.1271, B2 0.0318, F3 0.1682)."
          tryIt="load the exam preset, Predict, then Correct with white."
          onApply={() =>
            setup(() => {
              loadExam();
              setMode('colour');
              runQueue(['p', 'c']);
            })
          }
        />
        <PredictReveal
          id="bayes-grid2d-start-colour"
          question="In the exam the start tile G4 is **black**. If G4 were white instead, would the prediction $P(x_1)$ change?"
          options={['Yes: G3 would get more probability', 'No: the prediction never looks at colours', 'Only the slip probabilities change']}
          answer={1}
          explain="The prediction step only uses the motion model: $P(x_1) = \sum_{x_0} p(x_1 \mid u_1, x_0) P(x_0)$. Colours enter only in the correction, and then only the colour of the tile the robot is on **after** the move. G4 being black is a distractor in the question (the worked solution points it out)."
          tryIt="flip G4’s colour and Predict again: the numbers do not move."
          onApply={() =>
            setup(() => {
              loadExam();
              const m = cloneMap(MAP_2024_Q28);
              m.tiles[3][6] = 0;
              setMap(m);
              live.current = { ...live.current, map: m };
              setHist([{ bel: beliefOn(m, EXAM_STARTS), step: null }]);
              runQueue(['p']);
            })
          }
        />
        <PredictReveal
          id="bayes-grid2d-add"
          question="The robot starts on **C3 or D3** (0.5 each) and moves up (0.8 up, 0.2 up-left). What is $P(\text{C2})$ after the move?"
          options={['0.4', '0.1', '0.5', '0.8']}
          answer={2}
          explain="Two arrows land on C2: C3 moving up ($0.8 \times 0.5 = 0.4$) and D3 slipping up-left ($0.2 \times 0.5 = 0.1$). Contributions to the same tile **add**: $P(\text{C2}) = 0.4 + 0.1 = 0.5$. The prediction table lists both rows."
          tryIt="mark C3 and D3 as the start tiles and Predict."
          onApply={() =>
            setup(() => {
              loadExam();
              const st = [
                { c: 2, r: 2 },
                { c: 3, r: 2 },
              ];
              setStarts(st);
              setHist([{ bel: beliefOn(MAP_2024_Q28, st), step: null }]);
              runQueue(['p']);
            })
          }
        />
        <PredictReveal
          id="bayes-grid2d-perfect"
          question="Make the camera perfect ($P(\text{black} \mid \text{black}) = P(\text{white} \mid \text{white}) = 1$). After the exam’s move it sees white. What happens to C2 and B2?"
          options={['They keep a small probability', 'They drop to exactly 0', 'They become the most likely']}
          answer={1}
          explain="With a perfect camera $P(\text{white} \mid \text{black}) = 0$, so the products for the black tiles are 0 and the whole belief lands on the white tiles G3 and F3, in the ratio of their priors: $0.4 : 0.1$, i.e. 0.8 and 0.2. A probability of exactly 0 can never come back, which is why real sensor models keep a small error rate."
          tryIt="drag both camera sliders to 1 and repeat the exam steps."
          onApply={() =>
            setup(() => {
              loadExam();
              const s = { pBlackGivenBlack: 1, pWhiteGivenWhite: 1 };
              setSensor(s);
              live.current = { ...live.current, sensor: s };
              runQueue(['p', 'c']);
            })
          }
        />
      </Panel>
    </>
  );

  return (
    <BayesLayout
      left={left}
      right={right}
      below={
        <More label="Conventions (the paper’s)">
          <Rich
            text={`- Columns are letters (A = left), rows are numbers (1 = top), so C3 is column C, row 3, and **up** moves towards row 1.
- Prediction: $P(x_1) = \\sum_{x_0} p(x_1 \\mid u_1, x_0) P(x_0)$; outcomes that would leave the map leave the robot where it is.
- Correction: $P(x_1 \\mid z_1) = P(z_1 \\mid x_1) P(x_1) / P(z_1)$ with $P(z_1) = \\sum_{x_1} P(z_1 \\mid x_1) P(x_1)$. Only cells with non-zero predicted probability need a row.
- Editing a colour re-runs the steps already taken on the new map; editing the start tiles starts again.`}
          />
        </More>
      }
    />
  );
}

/** Order of the rows in a correction table: the order of the cells in the latest prediction. */
function orderOf(h: Snap[]): { c: number; r: number }[] | undefined {
  for (let k = h.length - 1; k >= 0; k--) {
    const s = h[k].step;
    if (s?.kind === 'predict') return s.table.cells.map((c) => ({ c: c.c, r: c.r }));
  }
  return undefined;
}

/** Re-run the same sequence of steps on an edited map (colours changed). */
function replay(m: TileMap, h: Snap[], moves: MoveOutcome[], sensor: ColourSensor): Snap[] {
  const out: Snap[] = [{ bel: h[0].bel, step: null }];
  for (let k = 1; k < h.length; k++) {
    const s = h[k].step;
    const prev = out[out.length - 1];
    if (!s) continue;
    if (s.kind === 'predict') {
      const table = gridPredictTable(m, prev.bel, moves);
      out.push({ bel: table.predicted, step: { kind: 'predict', table } });
    } else {
      const table = gridCorrectTable(m, prev.bel, s.z, sensor, orderOf(out));
      if (!(table.evidence > 0)) break;
      out.push({ bel: table.posterior, step: { kind: 'correct', table, z: s.z } });
    }
  }
  return out;
}

function PredictTableView({ t }: { t: PredictTable }) {
  const shared = t.cells.filter((c) => c.parts.length > 1);
  return (
    <div className="bayes-table-wrap">
      <table className="bayes-table">
        <thead>
          <tr>
            <th className="is-left">from</th>
            <th>
              <Rich text="$bel(x_0)$" inline />
            </th>
            <th className="is-left">outcome</th>
            <th className="is-left">to</th>
            <th>
              <Rich text="$p \times bel$" inline />
            </th>
          </tr>
        </thead>
        <tbody>
          {t.contributions.map((k, j) => (
            <tr key={j} className={shared.some((c) => c.label === k.to) ? 'is-shared' : undefined}>
              <td className="is-left">{k.from}</td>
              <td>{f4(k.prior)}</td>
              <td className="is-left">
                {moveName(k.move.dc, k.move.dr)} ({f2(k.move.p)}){k.blocked ? ' (blocked)' : ''}
              </td>
              <td className="is-left">{k.to}</td>
              <td>{f4(k.mass)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td className="is-left" colSpan={4}>
              Σ (all contributions)
            </td>
            <td>{f4(t.contributions.reduce((a, k) => a + k.mass, 0))}</td>
          </tr>
        </tfoot>
      </table>
      <p className="small bayes-tight">
        <Rich
          text={`$\\overline{bel}(x_1)$: ${t.cells.map((c) => `**${c.label}** ${Number(c.p.toFixed(4))}`).join(', ')}.${
            shared.length ? ` ${shared.map((c) => `${c.label} = ${c.parts.map((p) => Number(p.mass.toFixed(4))).join(' + ')} = ${Number(c.p.toFixed(4))}`).join('; ')} (contributions add).` : ''
          }`}
          inline
        />
      </p>
    </div>
  );
}
