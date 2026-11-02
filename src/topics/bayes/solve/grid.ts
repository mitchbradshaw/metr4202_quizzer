// Grid-world localisation by hand (bayes-grid): the 2024 Q28 template on a random tile map. A robot that may be
// on one of a few tiles takes an action with a slip outcome (prediction: contributions per start cell, which add
// when they land on the same tile), then a downward camera reports a colour (correction: prior × likelihood =
// product, Σ = P(z), product ÷ P(z) = posterior). Tier 1 has one starting tile; tier 3 adds a shared landing
// tile and a second image or a second action. One solver (core/bayestables.ts runGrid) answers every part and
// is checked against the 2024 worked solution in tests/generators.ts.
import type { ChoicePart, MatrixPart, NumericPart, SolveGenerator, SolveInstance, SolvePart, Tier } from '../../../engine/types';
import type { Rng } from '../../../engine/rng';
import { MAP_2024_Q28, cellLabel, pSeeGivenTile, type ColourSensor, type MoveOutcome, type Tile, type TileMap } from '../../../core/gridloc';
import { beliefOn, gridCorrectTable, gridPredictTable, ranked, runGrid, type CorrectTable, type GridStep, type GridStepResult, type PredictTable } from '../../../core/bayestables';
import { makeGridFigure } from './figures';
import { DIR_VEC, col, matrixTraps, moveName, movePhrase, num, numericTraps, type Dir } from './common';

export interface GridSpec {
  map: TileMap;
  /** Possible starting tiles and their probabilities (sum 1). */
  starts: { c: number; r: number; p: number }[];
  action: Dir;
  /** Outcomes of the action, the intended move first. */
  moves: MoveOutcome[];
  sensor: ColourSensor;
  /** The colour the camera reports after the move (0 white, 1 black). */
  z1: Tile;
  /** Tier 3: a second image without moving, or the same action again and then a second image. */
  second?: { kind: 'image' | 'move'; z2: Tile };
}

/** 2024 Q28 exactly as set: C3 or G4 (0.5 each), up 0.8 / up-left 0.2, camera 0.83 / 0.90, sees white. */
export const EXAM_2024: GridSpec = {
  map: MAP_2024_Q28,
  starts: [
    { c: 2, r: 2, p: 0.5 },
    { c: 6, r: 3, p: 0.5 },
  ],
  action: 'up',
  moves: [
    { dc: 0, dr: -1, p: 0.8 },
    { dc: -1, dr: -1, p: 0.2 },
  ],
  sensor: { pBlackGivenBlack: 0.83, pWhiteGivenWhite: 0.9 },
  z1: 0,
};

export function gridSteps(spec: GridSpec): GridStep[] {
  const steps: GridStep[] = [
    { kind: 'predict', moves: spec.moves },
    { kind: 'correct', z: spec.z1 },
  ];
  if (spec.second?.kind === 'image') steps.push({ kind: 'correct', z: spec.second.z2 });
  if (spec.second?.kind === 'move') steps.push({ kind: 'predict', moves: spec.moves }, { kind: 'correct', z: spec.second.z2 });
  return steps;
}

/** Every intermediate table of the instance, in order (predict, correct, [correct | predict, correct]). */
export function solveGrid(spec: GridSpec): GridStepResult[] {
  return runGrid(spec.map, beliefOn(spec.map, spec.starts), gridSteps(spec), spec.sensor);
}

// ------------------------------------------------------------------ random instances

const MAIN_P = [0.7, 0.75, 0.8, 0.85, 0.9, 0.6];

const SLIPS: Record<Dir, [number, number][]> = {
  up: [
    [-1, -1],
    [1, -1],
  ],
  down: [
    [-1, 1],
    [1, 1],
  ],
  left: [
    [-1, -1],
    [-1, 1],
  ],
  right: [
    [1, -1],
    [1, 1],
  ],
};

function randomMap(rng: Rng, cols: number, rows: number): TileMap {
  const tiles: Tile[][] = Array.from({ length: rows }, () => new Array<Tile>(cols).fill(0));
  const blobs = rng.int(2, 3);
  for (let b = 0; b < blobs; b++) {
    let c = rng.int(0, cols - 1);
    let r = rng.int(0, rows - 1);
    const size = rng.int(3, 5);
    for (let k = 0; k < size; k++) {
      tiles[r][c] = 1;
      const [dc, dr] = rng.pick([
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const);
      c = Math.max(0, Math.min(cols - 1, c + dc));
      r = Math.max(0, Math.min(rows - 1, r + dr));
    }
  }
  for (let k = rng.int(0, 2); k > 0; k--) tiles[rng.int(0, rows - 1)][rng.int(0, cols - 1)] = 1;
  return { cols, rows, tiles };
}

const inside = (m: TileMap, c: number, r: number) => c >= 0 && c < m.cols && r >= 0 && r < m.rows;

/** Every outcome of `steps` repeats of the action stays on the map (no boundary rule needed). */
function staysOn(m: TileMap, c: number, r: number, moves: readonly MoveOutcome[], steps: number): boolean {
  let cells = [[c, r]];
  for (let s = 0; s < steps; s++) {
    const next: number[][] = [];
    for (const [x, y] of cells)
      for (const mv of moves) {
        if (!inside(m, x + mv.dc, y + mv.dr)) return false;
        next.push([x + mv.dc, y + mv.dr]);
      }
    cells = next;
  }
  return true;
}

const PRIORS3: number[][] = [
  [0.5, 0.25, 0.25],
  [0.4, 0.3, 0.3],
  [0.5, 0.3, 0.2],
  [0.6, 0.2, 0.2],
];

function tryRandom(rng: Rng, tier: Tier): GridSpec | null {
  const map = randomMap(rng, rng.int(8, 10), rng.int(5, 6));
  const action = rng.pick<Dir>(['up', 'down', 'left', 'right']);
  const [mdc, mdr] = DIR_VEC[action];
  const [sdc, sdr] = rng.pick(SLIPS[action]);
  const p = rng.pick(MAIN_P);
  const moves: MoveOutcome[] = [
    { dc: mdc, dr: mdr, p },
    { dc: sdc, dr: sdr, p: Number((1 - p).toFixed(2)) },
  ];
  const variant: 'image' | 'move' | null = tier === 3 ? (rng.chance(0.5) ? 'image' : 'move') : null;
  const okCells: { c: number; r: number }[] = [];
  for (let r = 0; r < map.rows; r++) for (let c = 0; c < map.cols; c++) if (staysOn(map, c, r, moves, variant === 'move' ? 2 : 1)) okCells.push({ c, r });
  if (!okCells.length) return null;

  let starts: { c: number; r: number; p: number }[];
  if (tier === 1 || variant === 'move') {
    const s = rng.pick(okCells);
    starts = [{ ...s, p: 1 }];
  } else if (variant === 'image') {
    // Two starts whose outcomes share a landing tile: B = A + (intended − slip) or A + (slip − intended).
    const a = rng.pick(okCells);
    const sign = rng.chance(0.5) ? 1 : -1;
    const b = { c: a.c + sign * (mdc - sdc), r: a.r + sign * (mdr - sdr) };
    if (!okCells.some((x) => x.c === b.c && x.r === b.r)) return null;
    const pa = rng.pick([0.5, 0.6, 0.4, 0.7]);
    starts = rng.shuffle([
      { ...a, p: pa },
      { ...b, p: Number((1 - pa).toFixed(2)) },
    ]);
  } else {
    const k = rng.chance(0.75) ? 2 : 3;
    const picked = rng.shuffle(okCells).slice(0, k);
    if (picked.length < k) return null;
    const ps = k === 2 ? [0.5, 0.5] : rng.pick(PRIORS3);
    starts = picked.map((s, i) => ({ ...s, p: ps[i] }));
  }
  // Reading order, as the worked solutions list them.
  starts.sort((x, y) => x.r - y.r || x.c - y.c);
  const sensor: ColourSensor = { pBlackGivenBlack: rng.step(0.7, 0.95, 0.01), pWhiteGivenWhite: rng.step(0.7, 0.95, 0.01) };
  const z1: Tile = rng.chance(0.5) ? 1 : 0;
  const spec: GridSpec = { map, starts, action, moves, sensor, z1 };
  if (variant) spec.second = { kind: variant, z2: rng.chance(0.5) ? 1 : 0 };

  // Checks: the shape the tier promises, informative readings, a clear winner.
  const res = solveGrid(spec);
  const pred = res[0].predict!;
  const landings = pred.contributions.length;
  const shared = pred.cells.length < landings;
  if (tier !== 3 && shared) return null;
  if (variant === 'image' && !shared) return null;
  if (variant === 'move' && !(res[2].predict!.cells.length < res[2].predict!.contributions.length)) return null;
  for (const step of res) {
    if (!step.correct) continue;
    const colours = new Set(step.correct.rows.map((x) => x.tile));
    if (colours.size < 2) return null;
  }
  if (pred.cells.some((c) => c.p < 0.02)) return null;
  const final = ranked(res[res.length - 1].after);
  if (final.length < 2 || final[0].p - final[1].p < 0.012) return null;
  return spec;
}

export function randomGridSpec(rng: Rng, tier: Tier): GridSpec {
  for (let k = 0; k < 400; k++) {
    const s = tryRandom(rng, tier);
    if (s) return s;
  }
  return tier === 3 ? { ...EXAM_2024, second: { kind: 'image', z2: 1 } } : EXAM_2024;
}

// ------------------------------------------------------------------ the instance

const colour = (t: Tile) => (t === 1 ? 'black' : 'white');
const tx = (s: string) => `\\text{${s}}`;
const L = (c: number, r: number) => cellLabel(c, r);

/** P(z | tile) the way the camera table is read, e.g. "P(white | black tile) = 1 − 0.83 = 0.17". */
function likText(z: Tile, tile: Tile, s: ColourSensor): string {
  const v = pSeeGivenTile(z, tile, s);
  if (z === tile) return `P(${tx(colour(z))} \\mid ${tx(colour(tile))}) = ${num(v)}`;
  const given = tile === 1 ? s.pBlackGivenBlack : s.pWhiteGivenWhite;
  return `P(${tx(colour(z))} \\mid ${tx(colour(tile))}) = 1 - ${num(given)} = ${num(v)}`;
}

/** The camera table read the wrong way: P(z | other colour) taken as P(other | other). */
function wrongLik(z: Tile, tile: Tile, s: ColourSensor): number {
  if (z === tile) return pSeeGivenTile(z, tile, s);
  return tile === 1 ? s.pBlackGivenBlack : s.pWhiteGivenWhite;
}

function predictTex(t: PredictTable, sub: string): string {
  const rows = t.contributions.map((k) => `${tx(k.from)} & ${num(k.prior)} & ${tx(moveName(k.move.dc, k.move.dr))}\\ (${num(k.move.p)}) & ${tx(k.to)} & ${num(k.move.p)} \\times ${num(k.prior)} = ${num(k.mass)}`);
  const sums = t.cells
    .filter((c) => c.parts.length > 1)
    .map((c) => `P(x_{${sub}} = ${tx(c.label)}) = ${c.parts.map((p) => num(p.mass)).join(' + ')} = ${num(c.p)}`);
  return `$$\\begin{array}{c|c|l|c|l} x_{${Number(sub) - 1}} & P(x_{${Number(sub) - 1}}) & \\text{outcome} & x_{${sub}} & p(x_{${sub}} \\mid u, x_{${Number(sub) - 1}})\\,P(x_{${Number(sub) - 1}}) \\\\ \\hline ${rows.join(' \\\\ ')} \\end{array}$$${sums.length ? `\n\nContributions to the same tile add: $${sums.join(',\\quad ')}$.` : ''}`;
}

function correctTex(t: CorrectTable, z: Tile, sub: string): string {
  const rows = t.rows.map((x) => `${tx(`${x.label} (${colour(x.tile)})`)} & ${num(x.prior)} & ${num(x.lik)} & ${num(x.product, 5)} & ${num(x.post)}`);
  return `$$\\begin{array}{c|c|c|c|c} x_{${sub}} & \\text{prior} & P(${tx(colour(z))} \\mid x_{${sub}}) & \\text{product} & \\text{posterior} = \\text{product} / ${num(t.evidence, 5)} \\\\ \\hline ${rows.join(' \\\\ ')} \\\\ \\hline & ${num(t.rows.reduce((a, x) => a + x.prior, 0))} & & ${num(t.evidence, 5)} & ${num(t.rows.reduce((a, x) => a + x.post, 0))} \\end{array}$$`;
}

export function buildGridInstance(spec: GridSpec, tier: Tier): SolveInstance {
  const res = solveGrid(spec);
  const { map, sensor, moves, starts } = spec;
  const pred1 = res[0].predict!;
  const corr1 = res[1].correct!;
  const second = spec.second;
  const main = moves[0];
  const slip = moves[1];
  const z1 = spec.z1;
  const startTxt = starts.map((s) => L(s.c, s.r));
  const equal = starts.every((s) => Math.abs(s.p - starts[0].p) < 1e-9);

  // ---------------------------------------------------------------- prompt
  let where: string;
  if (starts.length === 1) where = `It knows it starts on ${startTxt[0]}: $P(x_0 = ${tx(startTxt[0])}) = 1$.`;
  else if (equal && starts.length === 2)
    where = `It is equally likely to be on ${startTxt[0]} or ${startTxt[1]}, and cannot be anywhere else: $P(x_0 = ${tx(startTxt[0])}) = P(x_0 = ${tx(startTxt[1])}) = ${num(starts[0].p)}$.`;
  else
    where = `It may be on ${startTxt.slice(0, -1).join(', ')} or ${startTxt[startTxt.length - 1]}, with ${starts
      .map((s, i) => `$P(x_0 = ${tx(startTxt[i])}) = ${num(s.p)}$`)
      .join(', ')}, and zero probability everywhere else.`;
  const motion = `The robot takes the action $u_1$ = ${spec.action}. Its motion is not perfect: with probability ${num(main.p)} it ${movePhrase(main, true)}, and with probability ${num(slip.p)} it ${movePhrase(slip, false)} (figure (b)).`;
  const cam = `A downward-facing camera reports the colour of the tile the robot is on, with $P(${tx('black')} \\mid ${tx('black tile')}) = ${num(sensor.pBlackGivenBlack)}$ and $P(${tx('white')} \\mid ${tx('white tile')}) = ${num(sensor.pWhiteGivenWhite)}$. After the move it reports **${colour(z1)}** ($z_1$ = ${colour(z1)}).`;
  const more =
    second?.kind === 'image'
      ? `The camera then takes a second image, with the robot still on the same tile, and reports **${colour(second.z2)}** ($z_2$). Treat the two images as conditionally independent given the robot’s tile.`
      : second?.kind === 'move'
        ? `The robot then repeats the action ($u_2$ = ${spec.action}, same transition probabilities), after which the camera reports **${colour(second.z2)}** ($z_2$).`
        : '';
  const prompt = [
    `A robot (a grey circle in figure (a)) is localising itself on a known map of black and white tiles. ${where}`,
    motion,
    cam + (more ? ` ${more}` : ''),
  ].join('\n\n');

  // ---------------------------------------------------------------- parts
  const parts: SolvePart[] = [];
  const marks = tier === 3 ? (second?.kind === 'move' ? [3, 2, 2, 3, 2, 2, 1] : [5, 2, 3, 2, 2, 1]) : [6, 3, 5, 1];
  let mi = 0;
  const nextMarks = () => marks[mi++] ?? 1;
  const letter = (k: number) => `(${String.fromCharCode(97 + k)})`;
  let li = 0;

  const predPart = (t: PredictTable, before: GridStepResult['before'], sub: string, id: string, extraTraps: { value: number[][]; message: string; trapId?: string }[] = []): MatrixPart => {
    const answer = col(t.cells.map((c) => c.p));
    const forgot = col(t.cells.map((c) => c.parts.reduce((a, k) => a + k.move.p, 0)));
    const swapped = col(
      gridPredictTable(
        map,
        before,
        moves.map((m, i) => ({ ...m, p: moves[moves.length - 1 - i].p }))
      ).cells.map((c) => {
        const same = t.cells.find((x) => x.label === c.label);
        return same ? c.p : NaN;
      })
    );
    const firstOnly = col(t.cells.map((c) => c.parts[0].mass));
    return {
      kind: 'matrix',
      id,
      label: `${letter(li++)} Every non-zero probability after the action, $${sub === '1' ? 'P(x_1 \\mid u_1, x_0)' : 'P(x_2 \\mid u_2, z_1, u_1, x_0)'}$, one per tile (the tiles listed are the ones the robot can reach)`,
      answer,
      rowLabels: t.cells.map((c) => tx(c.label)),
      colLabels: [`$P(x_{${sub}})$`],
      absTol: 0.002,
      traps: matrixTraps(answer, [
        ...extraTraps,
        { value: firstOnly, message: 'One tile can be reached from two starts (or by two outcomes): **add** the contributions that land on it.', trapId: 'contributions-add' },
        { value: forgot, message: 'Those are only the transition probabilities. Multiply each by the probability of the tile it starts from, $p(x_1 \\mid u, x_0)\\,P(x_0)$.', trapId: 'bayes-forgot-prior' },
        { value: swapped, message: `The intended move has probability ${num(main.p)} and the slip ${num(slip.p)}: those two are swapped.` },
      ]),
      marks: nextMarks(),
    };
  };

  const evidencePart = (t: CorrectTable, z: Tile, sub: string, id: string, traps: { value: number; message: string; trapId?: string }[]): NumericPart => ({
    kind: 'numeric',
    id,
    label: `${letter(li++)} The total probability of the reading, $P(z_{${sub}} = ${tx(colour(z))})$`,
    answer: t.evidence,
    unit: '',
    tol: 0.004,
    absTol: 0.002,
    traps: numericTraps(t.evidence, traps),
    marks: nextMarks(),
  });

  const posteriorPart = (t: CorrectTable, z: Tile, xSub: string, zSub: string, id: string, traps: { value: number[][]; message: string; trapId?: string }[]): MatrixPart => {
    const answer = col(t.rows.map((x) => x.post));
    return {
      kind: 'matrix',
      id,
      label: `${letter(li++)} The posterior of each tile after seeing ${colour(z)}, $P(x_{${xSub}} \\mid z_{${zSub}} = ${tx(colour(z))}, \\dots)$`,
      answer,
      rowLabels: t.rows.map((x) => tx(x.label)),
      colLabels: ['posterior'],
      absTol: 0.002,
      traps: matrixTraps(answer, traps),
      marks: nextMarks(),
    };
  };

  // Wrong-likelihood and wrong-prior versions, for the traps.
  const wrongEvidence = (t: CorrectTable, z: Tile) => t.rows.reduce((a, x) => a + x.prior * wrongLik(z, x.tile, sensor), 0);
  const wrongPosterior = (t: CorrectTable, z: Tile) => {
    const ev = wrongEvidence(t, z);
    return col(t.rows.map((x) => (x.prior * wrongLik(z, x.tile, sensor)) / ev));
  };
  const products = (t: CorrectTable) => col(t.rows.map((x) => x.product));
  const startEvidence = starts.reduce((a, s) => a + s.p * pSeeGivenTile(z1, map.tiles[s.r][s.c], sensor), 0);

  parts.push(predPart(pred1, res[0].before, '1', 'pred1'));
  parts.push(
    evidencePart(corr1, z1, '1', 'pz1', [
      { value: wrongEvidence(corr1, z1), message: `Read the likelihood for the colour that was **seen**: $${likText(z1, z1 === 1 ? 0 : 1, sensor)}$, not ${num(wrongLik(z1, z1 === 1 ? 0 : 1, sensor))}.`, trapId: 'likelihood-column' },
      { value: startEvidence, message: 'That uses the starting tiles. The camera looks at the tile the robot is on **after** the move: use the predicted probabilities from the first part.', trapId: 'bayes-start-colour' },
    ])
  );
  parts.push(
    posteriorPart(corr1, z1, '1', '1', 'post1', [
      { value: products(corr1), message: `Those are the products $P(z \\mid x)P(x)$. Divide each by $P(z_1)$ = ${num(corr1.evidence, 5)} so the posteriors sum to 1.`, trapId: 'normalise' },
      { value: wrongPosterior(corr1, z1), message: `Check the likelihoods: for ${colour(z1)} seen on a ${colour(z1 === 1 ? 0 : 1)} tile, $${likText(z1, z1 === 1 ? 0 : 1, sensor)}$.`, trapId: 'likelihood-column' },
    ])
  );

  let lastCells = corr1.rows.map((x) => ({ label: x.label, p: x.post }));
  if (second?.kind === 'image') {
    const corr2 = res[2].correct!;
    const fromPred = gridCorrectTable(map, pred1.predicted, second.z2, sensor, pred1.cells);
    parts.push(
      evidencePart(corr2, second.z2, '2', 'pz2', [
        { value: fromPred.evidence, message: 'Start the second update from the posterior after the first image, not from the predicted belief.', trapId: 'bayes-chain-prior' },
        { value: wrongEvidence(corr2, second.z2), message: `Read the likelihood for the colour seen: $${likText(second.z2, second.z2 === 1 ? 0 : 1, sensor)}$.`, trapId: 'likelihood-column' },
      ])
    );
    parts.push(
      posteriorPart(corr2, second.z2, '1', '2', 'post2', [
        { value: products(corr2), message: `Divide each product by $P(z_2)$ = ${num(corr2.evidence, 5)}.`, trapId: 'normalise' },
        { value: col(fromPred.rows.map((x) => x.post)), message: 'Each posterior is the next prior: start from the posterior after the first image.', trapId: 'bayes-chain-prior' },
      ])
    );
    lastCells = corr2.rows.map((x) => ({ label: x.label, p: x.post }));
  } else if (second?.kind === 'move') {
    const pred2 = res[2].predict!;
    const corr2 = res[3].correct!;
    const skipCorr = gridPredictTable(map, pred1.predicted, moves);
    const skipVals = col(pred2.cells.map((c) => skipCorr.cells.find((x) => x.label === c.label)?.p ?? NaN));
    parts.push(predPart(pred2, res[2].before, '2', 'pred2', [{ value: skipVals, message: 'Push the **posterior** after $z_1$ through the motion model, not the belief from before the first correction.', trapId: 'bayes-chain-prior' }]));
    parts.push(
      evidencePart(corr2, second.z2, '2', 'pz2', [
        { value: wrongEvidence(corr2, second.z2), message: `Read the likelihood for the colour seen: $${likText(second.z2, second.z2 === 1 ? 0 : 1, sensor)}$.`, trapId: 'likelihood-column' },
      ])
    );
    parts.push(
      posteriorPart(corr2, second.z2, '2', '2', 'post2', [
        { value: products(corr2), message: `Divide each product by $P(z_2)$ = ${num(corr2.evidence, 5)}.`, trapId: 'normalise' },
        { value: wrongPosterior(corr2, second.z2), message: 'Check which likelihood each tile gets for the colour seen.', trapId: 'likelihood-column' },
      ])
    );
    lastCells = corr2.rows.map((x) => ({ label: x.label, p: x.post }));
  }

  const best = lastCells.reduce((a, b) => (b.p > a.p ? b : a), lastCells[0]);
  const bestPart: ChoicePart = {
    kind: 'choice',
    id: 'best',
    label: `${letter(li++)} Which tile is the robot now most likely to be on?`,
    options: lastCells.map((x) => ({
      text: x.label,
      correct: x.label === best.label,
      why: x.label === best.label ? `Largest posterior, ${num(x.p)}.` : `Posterior ${num(x.p)} < ${num(best.p)} (${best.label}).`,
    })),
    marks: nextMarks(),
  };
  parts.push(bestPart);

  // ---------------------------------------------------------------- hints
  const lik1 = [...new Set(corr1.rows.map((x) => x.tile))].map((t) => likText(z1, t, sensor)).join(',\\qquad ');
  const contribTxt = (t: PredictTable) => {
    const froms = [...new Set(t.contributions.map((k) => k.from))];
    return froms
      .map((f) => {
        const ks = t.contributions.filter((k) => k.from === f);
        return `from ${f} ($P$ = ${num(ks[0].prior)}): ${ks.map((k) => `${moveName(k.move.dc, k.move.dr)} → ${k.to}, ${num(k.move.p)} × ${num(k.prior)} = ${num(k.mass)}`).join('; ')}`;
      })
      .join('. ');
  };
  const sumTxt = (t: CorrectTable, z: Tile, sub: string) =>
    `$P(z_{${sub}} = ${tx(colour(z))}) = ${t.rows.map((x) => `${num(x.lik)}(${num(x.prior)})`).join(' + ')} = ${num(t.evidence, 5)}$`;
  const colours1 = (['black', 'white'] as const)
    .map((cname) => {
      const ls = corr1.rows.filter((x) => colour(x.tile) === cname).map((x) => x.label);
      return ls.length ? `${ls.join(' and ')} ${ls.length > 1 ? 'are' : 'is'} ${cname}` : '';
    })
    .filter(Boolean)
    .join('; ');

  const h1 =
    'Two steps of the Bayes filter. **Prediction** pushes each starting probability through the motion model: every start splits into one piece per outcome, and pieces that land on the same tile add. The tile colours play no part yet. **Correction** multiplies each predicted tile by the likelihood of what the camera saw, $P(z \\mid x)$, then divides by the sum $P(z)$ so the posteriors add to 1. Seeing a colour moves belief onto tiles of that colour.' +
    (second ? ' With a second step, the posterior of the first update becomes the prior of the next.' : '');
  const h2 = [
    '$$\\overline{bel}(x_1) = \\sum_{x_0} p(x_1 \\mid u_1, x_0)\\, bel(x_0)$$',
    '$$P(z_1) = \\sum_{x_1} P(z_1 \\mid x_1)\\,\\overline{bel}(x_1), \\qquad bel(x_1) = \\frac{P(z_1 \\mid x_1)\\,\\overline{bel}(x_1)}{P(z_1)} = \\eta\\, P(z_1 \\mid x_1)\\,\\overline{bel}(x_1)$$',
    `Read the likelihoods for the colour that was **seen**: $${lik1}$.`,
  ].join('\n\n');
  const h3Parts = [`Prediction: ${contribTxt(pred1)}.`, `After the move ${colours1}, so ${sumTxt(corr1, z1, '1')}.`];
  if (second?.kind === 'image') h3Parts.push(`Second image: the priors are the posteriors from the first image; ${sumTxt(res[2].correct!, second.z2, '2')}.`);
  if (second?.kind === 'move') h3Parts.push(`Second action, from the posteriors: ${contribTxt(res[2].predict!)}. Then ${sumTxt(res[3].correct!, second.z2, '2')}.`);
  const h3 = h3Parts.join('\n\n');

  const w: string[] = [];
  w.push(`**Prediction** ($u_1$ = ${spec.action}):`, predictTex(pred1, '1'));
  w.push(`**${pred1.cells.map((c) => `P(${c.label}) = ${num(c.p)}`).join(', ')}** (sum ${num(pred1.cells.reduce((a, c) => a + c.p, 0))} ✓).`);
  w.push(`**Correction** with $z_1$ = ${colour(z1)}:`, correctTex(corr1, z1, '1'));
  w.push(`**$P(z_1 = ${tx(colour(z1))})$ = ${num(corr1.evidence, 4)}**; posteriors **${corr1.rows.map((x) => `${x.label} ${num(x.post)}`).join(', ')}**.`);
  if (second?.kind === 'image') {
    const c2 = res[2].correct!;
    w.push(`**Second image** ($z_2$ = ${colour(second.z2)}), starting from the posteriors above:`, correctTex(c2, second.z2, '1'));
    w.push(`**$P(z_2 = ${tx(colour(second.z2))})$ = ${num(c2.evidence, 4)}**; posteriors **${c2.rows.map((x) => `${x.label} ${num(x.post)}`).join(', ')}**.`);
  } else if (second?.kind === 'move') {
    const p2 = res[2].predict!;
    const c2 = res[3].correct!;
    w.push(`**Second action** ($u_2$ = ${spec.action}), from the posteriors:`, predictTex(p2, '2'));
    w.push(`**${p2.cells.map((c) => `P(${c.label}) = ${num(c.p)}`).join(', ')}**.`);
    w.push(`**Correction** with $z_2$ = ${colour(second.z2)}:`, correctTex(c2, second.z2, '2'));
    w.push(`**$P(z_2 = ${tx(colour(second.z2))})$ = ${num(c2.evidence, 4)}**; posteriors **${c2.rows.map((x) => `${x.label} ${num(x.post)}`).join(', ')}**.`);
  }
  w.push(`The most likely tile is **${best.label}** (${num(best.p)}).`);
  const h4 = w.join('\n\n');

  const figure = makeGridFigure({ map, starts, moves, action: spec.action, showP: !equal });
  return {
    prompt,
    givens: [
      { sym: `P(${tx('black')} \\mid ${tx('black')})`, value: num(sensor.pBlackGivenBlack), label: 'camera on a black tile' },
      { sym: `P(${tx('white')} \\mid ${tx('white')})`, value: num(sensor.pWhiteGivenWhite), label: 'camera on a white tile' },
      { sym: 'u_1', value: `${spec.action}: ${moves.map((m) => `${moveName(m.dc, m.dr)} ${num(m.p)}`).join(', ')}`, label: 'action and its outcomes' },
      { sym: 'z_1', value: colour(z1), label: 'camera reading after the move' },
      ...(second ? [{ sym: 'z_2', value: colour(second.z2), label: second.kind === 'image' ? 'second image, same tile' : `after $u_2$ = ${spec.action}` }] : []),
    ],
    figure,
    parts,
    hints: [h1, h2, h3, h4],
  };
}

export const generators: SolveGenerator[] = [
  {
    id: 'bayes-grid',
    title: 'Grid-world localisation: predict, then correct',
    summary: 'A known map of black and white tiles, a noisy action with a slip outcome, and a camera that reads the tile colour: the predicted probabilities, $P(z)$, the posteriors and the most likely tile.',
    tiers: [1, 2, 3],
    source: 'Similar to 2024 Q28 (15 marks); summary notes §1 “How to attack a discrete Bayes long answer”',
    cardId: 'bayes-by-hand',
    marks: 15,
    sprint: false,
    generate(rng, tier) {
      return buildGridInstance(randomGridSpec(rng, tier), tier);
    },
  },
];
