// Grid-world localisation on a known map of black and white tiles (2024 Q28 template).
// Columns are letters (A = 0), rows are numbers (1 = top row). "Up" moves to the row above (r − 1).

export type Tile = 0 | 1; // 0 = white, 1 = black

export interface TileMap {
  cols: number;
  rows: number;
  /** tiles[r][c], r = 0 is row 1 (top). */
  tiles: Tile[][];
}

/** "C3" for column index 2, row index 2. */
export function cellLabel(c: number, r: number): string {
  return `${String.fromCharCode(65 + c)}${r + 1}`;
}

export function parseCell(label: string): { c: number; r: number } {
  const m = /^([A-Za-z])(\d+)$/.exec(label.trim());
  if (!m) throw new Error(`Bad cell label: ${label}`);
  return { c: m[1].toUpperCase().charCodeAt(0) - 65, r: Number(m[2]) - 1 };
}

/** A motion outcome: shift (dc, dr) with probability p. 2024 Q28: up = (0, −1) 0.8, up-left = (−1, −1) 0.2. */
export interface MoveOutcome {
  dc: number;
  dr: number;
  p: number;
}

/** What happens to probability that would leave the map: stay put (default) or vanish (then renormalise). */
export type Boundary = 'stay' | 'drop';

export type Belief = number[][]; // belief[r][c]

export function emptyBelief(m: TileMap): Belief {
  return Array.from({ length: m.rows }, () => new Array<number>(m.cols).fill(0));
}

export function uniformBelief(m: TileMap): Belief {
  const v = 1 / (m.rows * m.cols);
  return Array.from({ length: m.rows }, () => new Array<number>(m.cols).fill(v));
}

/** Prediction: push each cell's probability through the motion outcomes. Contributions to the same cell add. */
export function predictGrid(m: TileMap, bel: Belief, moves: readonly MoveOutcome[], boundary: Boundary = 'stay'): Belief {
  const out = emptyBelief(m);
  for (let r = 0; r < m.rows; r++)
    for (let c = 0; c < m.cols; c++) {
      const b = bel[r][c];
      if (!b) continue;
      for (const mv of moves) {
        const nc = c + mv.dc;
        const nr = r + mv.dr;
        if (nc >= 0 && nc < m.cols && nr >= 0 && nr < m.rows) out[nr][nc] += b * mv.p;
        else if (boundary === 'stay') out[r][c] += b * mv.p;
      }
    }
  if (boundary === 'drop') {
    const s = out.flat().reduce((a, x) => a + x, 0);
    if (s > 0) for (const row of out) for (let c = 0; c < row.length; c++) row[c] /= s;
  }
  return out;
}

/** Camera model: P(see black | black tile) and P(see white | white tile). */
export interface ColourSensor {
  pBlackGivenBlack: number;
  pWhiteGivenWhite: number;
}

export function pSeeGivenTile(z: Tile, tile: Tile, s: ColourSensor): number {
  if (tile === 1) return z === 1 ? s.pBlackGivenBlack : 1 - s.pBlackGivenBlack;
  return z === 0 ? s.pWhiteGivenWhite : 1 - s.pWhiteGivenWhite;
}

/** Correction: bel(x) = η P(z | x) bel⁻(x). Returns the evidence P(z) too. */
export function correctGrid(m: TileMap, bel: Belief, z: Tile, s: ColourSensor): { evidence: number; posterior: Belief } {
  const post = emptyBelief(m);
  let ev = 0;
  for (let r = 0; r < m.rows; r++)
    for (let c = 0; c < m.cols; c++) {
      const v = bel[r][c] * pSeeGivenTile(z, m.tiles[r][c], s);
      post[r][c] = v;
      ev += v;
    }
  if (ev > 0) for (const row of post) for (let c = 0; c < row.length; c++) row[c] /= ev;
  return { evidence: ev, posterior: post };
}

/** Non-zero cells as { label, p }, in reading order. */
export function nonZero(bel: Belief, eps = 1e-12): { label: string; c: number; r: number; p: number }[] {
  const out: { label: string; c: number; r: number; p: number }[] = [];
  bel.forEach((row, r) => row.forEach((p, c) => p > eps && out.push({ label: cellLabel(c, r), c, r, p })));
  return out;
}

/** Build a TileMap from the black-tile labels. */
export function mapFromBlack(cols: number, rows: number, black: readonly string[]): TileMap {
  const tiles: Tile[][] = Array.from({ length: rows }, () => new Array<Tile>(cols).fill(0));
  for (const b of black) {
    const { c, r } = parseCell(b);
    tiles[r][c] = 1;
  }
  return { cols, rows, tiles };
}

/** The 2024 Q28 map (10 × 6): black tiles B2, C2, D2, B3, D3, H3, G4, H4, I4, H5. */
export const MAP_2024_Q28: TileMap = mapFromBlack(10, 6, ['B2', 'C2', 'D2', 'B3', 'D3', 'H3', 'G4', 'H4', 'I4', 'H5']);
