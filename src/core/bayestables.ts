// By-hand tables for discrete Bayes problems (summary notes §1, "How to attack a discrete Bayes long answer"):
//   - the prediction contributions of a grid move, where contributions to the same cell add (2024 Q28 (a));
//   - the correction table prior × likelihood = product, Σ = P(z), product / Σ = posterior (2024 Q28 (b), (c));
//   - several steps in a row (predict, correct, correct …);
//   - a classifier's measurement sequence and an expected-outcome decision (2025 Q28).
// Built on prob.ts and gridloc.ts, so the simulations, the exam-mode generators and the self-tests share one solver.
import { bayesSequence, expectation, likelihoodColumn, type BayesTable } from './prob';
import { cellLabel, emptyBelief, pSeeGivenTile, type Belief, type Boundary, type ColourSensor, type MoveOutcome, type Tile, type TileMap } from './gridloc';

// ------------------------------------------------------------------ grid prediction

/** One arrow of the prediction step: a start cell's probability times one motion outcome. */
export interface Contribution {
  fromC: number;
  fromR: number;
  from: string;
  toC: number;
  toR: number;
  to: string;
  move: MoveOutcome;
  /** bel(x_{t−1}) of the start cell. */
  prior: number;
  /** p(x_t | u, x_{t−1}) · bel(x_{t−1}). */
  mass: number;
  /** The outcome would leave the map: with boundary 'stay' the robot stays put; with 'drop' the mass is lost. */
  blocked: boolean;
}

export interface PredictCell {
  c: number;
  r: number;
  label: string;
  /** Predicted probability bel⁻(x_t): the sum of `parts`. */
  p: number;
  parts: Contribution[];
}

export interface PredictTable {
  contributions: Contribution[];
  /** Destination cells in order of first appearance (start cells in reading order, outcomes in the given order). */
  cells: PredictCell[];
  predicted: Belief;
}

/** The prediction step written out the way the worked solutions do it. Matches gridloc.predictGrid exactly. */
export function gridPredictTable(m: TileMap, bel: Belief, moves: readonly MoveOutcome[], boundary: Boundary = 'stay'): PredictTable {
  const contributions: Contribution[] = [];
  const cells: PredictCell[] = [];
  const at = new Map<string, PredictCell>();
  for (let r = 0; r < m.rows; r++)
    for (let c = 0; c < m.cols; c++) {
      const b = bel[r][c];
      if (!b) continue;
      for (const mv of moves) {
        if (!mv.p) continue;
        let nc = c + mv.dc;
        let nr = r + mv.dr;
        const blocked = nc < 0 || nc >= m.cols || nr < 0 || nr >= m.rows;
        if (blocked && boundary === 'drop') {
          contributions.push({ fromC: c, fromR: r, from: cellLabel(c, r), toC: -1, toR: -1, to: '—', move: mv, prior: b, mass: b * mv.p, blocked });
          continue;
        }
        if (blocked) {
          nc = c;
          nr = r;
        }
        const k: Contribution = { fromC: c, fromR: r, from: cellLabel(c, r), toC: nc, toR: nr, to: cellLabel(nc, nr), move: mv, prior: b, mass: b * mv.p, blocked };
        contributions.push(k);
        let cell = at.get(k.to);
        if (!cell) {
          cell = { c: nc, r: nr, label: k.to, p: 0, parts: [] };
          at.set(k.to, cell);
          cells.push(cell);
        }
        cell.p += k.mass;
        cell.parts.push(k);
      }
    }
  const predicted = emptyBelief(m);
  for (const cell of cells) predicted[cell.r][cell.c] = cell.p;
  if (boundary === 'drop') {
    const s = cells.reduce((t, x) => t + x.p, 0);
    if (s > 0) {
      for (const cell of cells) {
        cell.p /= s;
        predicted[cell.r][cell.c] = cell.p;
      }
    }
  }
  return { contributions, cells, predicted };
}

// ------------------------------------------------------------------ grid correction

export interface CorrectRow {
  c: number;
  r: number;
  label: string;
  tile: Tile;
  prior: number;
  /** P(z | x): the entry for the observed colour given this tile's true colour. */
  lik: number;
  product: number;
  post: number;
}

export interface CorrectTable {
  rows: CorrectRow[];
  /** Σ product = P(z). */
  evidence: number;
  posterior: Belief;
}

/**
 * The correction table over the cells with non-zero prior: prior · P(z | x) = product, P(z) = Σ product,
 * posterior = product / P(z). `order` lists the cells in the order to show them (default: reading order).
 */
export function gridCorrectTable(m: TileMap, bel: Belief, z: Tile, s: ColourSensor, order?: readonly { c: number; r: number }[]): CorrectTable {
  const cells: { c: number; r: number }[] = [];
  if (order) {
    for (const o of order) if (bel[o.r][o.c] > 0) cells.push({ c: o.c, r: o.r });
  } else {
    for (let r = 0; r < m.rows; r++) for (let c = 0; c < m.cols; c++) if (bel[r][c] > 0) cells.push({ c, r });
  }
  const rows: CorrectRow[] = cells.map(({ c, r }) => {
    const tile = m.tiles[r][c];
    const lik = pSeeGivenTile(z, tile, s);
    const prior = bel[r][c];
    return { c, r, label: cellLabel(c, r), tile, prior, lik, product: prior * lik, post: 0 };
  });
  const evidence = rows.reduce((t, x) => t + x.product, 0);
  const posterior = emptyBelief(m);
  for (const row of rows) {
    row.post = evidence > 0 ? row.product / evidence : 0;
    posterior[row.r][row.c] = row.post;
  }
  return { rows, evidence, posterior };
}

// ------------------------------------------------------------------ several steps

export type GridStep = { kind: 'predict'; moves: MoveOutcome[] } | { kind: 'correct'; z: Tile };

export interface GridStepResult {
  step: GridStep;
  before: Belief;
  after: Belief;
  predict?: PredictTable;
  correct?: CorrectTable;
}

/** Run predict / correct steps in order; each step's output belief is the next step's input. */
export function runGrid(m: TileMap, bel0: Belief, steps: readonly GridStep[], s: ColourSensor, boundary: Boundary = 'stay'): GridStepResult[] {
  const out: GridStepResult[] = [];
  let bel = bel0;
  let order: { c: number; r: number }[] | undefined;
  for (const step of steps) {
    if (step.kind === 'predict') {
      const predict = gridPredictTable(m, bel, step.moves, boundary);
      out.push({ step, before: bel, after: predict.predicted, predict });
      bel = predict.predicted;
      order = predict.cells.map((c) => ({ c: c.c, r: c.r }));
    } else {
      const correct = gridCorrectTable(m, bel, step.z, s, order);
      out.push({ step, before: bel, after: correct.posterior, correct });
      bel = correct.posterior;
    }
  }
  return out;
}

/** Cells with non-zero probability, most likely first (ties keep reading order). */
export function ranked(bel: Belief, eps = 1e-12): { c: number; r: number; label: string; p: number }[] {
  const out: { c: number; r: number; label: string; p: number }[] = [];
  bel.forEach((row, r) => row.forEach((p, c) => p > eps && out.push({ c, r, label: cellLabel(c, r), p })));
  return out.sort((a, b) => b.p - a.p);
}

/** Belief with equal probability on the listed cells (the papers' "equally likely to be at C3 or G4"). */
export function beliefOn(m: TileMap, cells: readonly { c: number; r: number; p?: number }[]): Belief {
  const bel = emptyBelief(m);
  const given = cells.every((x) => x.p !== undefined);
  for (const x of cells) bel[x.r][x.c] += given ? (x.p as number) : 1 / cells.length;
  return bel;
}

// ------------------------------------------------------------------ classifier and decisions (2025 Q28)

/**
 * A classifier's measurement sequence: each detection's likelihood is that column of the confusion table
 * (table[true][detected] = P(detected | true)), and each posterior is the next prior (no prediction step:
 * the object does not change between frames).
 */
export function classifierRun(prior: readonly number[], table: readonly (readonly number[])[], detections: readonly number[]): BayesTable[] {
  return bayesSequence(
    prior,
    detections.map((d) => likelihoodColumn(table, d))
  );
}

/**
 * Expected outcome of each option under a belief: E_g = Σ_x P(success | g, x) P(x). `success[g][x]`.
 * Returns the expectations and the index of the best option.
 */
export function decide(belief: readonly number[], success: readonly (readonly number[])[]): { expected: number[]; best: number } {
  const expected = success.map((row) => expectation(belief, row));
  let best = 0;
  for (let g = 1; g < expected.length; g++) if (expected[g] > expected[best]) best = g;
  return { expected, best };
}
