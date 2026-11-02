// The black-and-white tile map of the grid-world localisation problems (2024 Q28), drawn from a TileMap, and the
// transition-probability stencil beside it (the paper's Figure 2b). Shared by the grid-world simulation and the
// bayes-grid exam figure. Tile colours are the floor's real colours (black and white in both themes), set as
// --bayes-black / --bayes-white in bayes.css.
import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { cellLabel, type MoveOutcome, type TileMap } from '../../../core/gridloc';
import { moveName } from '../solve/common';
import '../bayes.css';

export const TB = { cell: 40, padL: 24, padT: 22, padR: 4, padB: 4 };
export const tbX = (c: number) => TB.padL + c * TB.cell;
export const tbY = (r: number) => TB.padT + r * TB.cell;
export const tbCx = (c: number) => tbX(c) + TB.cell / 2;
export const tbCy = (r: number) => tbY(r) + TB.cell / 2;
export const tbW = (m: TileMap) => TB.padL + m.cols * TB.cell + TB.padR;
export const tbH = (m: TileMap) => TB.padT + m.rows * TB.cell + TB.padB;

/** Text colour that reads on a tile: light on black tiles, dark on white tiles. */
export const inkOn = (black: boolean) => (black ? 'var(--bayes-white)' : 'var(--bayes-black)');

export function TileBoard({
  map,
  children,
  onCell,
  ariaLabel,
  maxWidth,
  cellTitle,
}: {
  map: TileMap;
  children?: ReactNode;
  /** Makes every tile a button (click, Enter or Space). */
  onCell?: (c: number, r: number) => void;
  ariaLabel: string;
  maxWidth?: number;
  /** Tooltip / accessible name per tile when it is a button. */
  cellTitle?: (c: number, r: number) => string;
}) {
  const W = tbW(map);
  const H = tbH(map);
  // Roving tab stop: the board is one Tab stop and the arrow keys move between tiles (not 60 Tab presses).
  const [cur, setCur] = useState({ c: 0, r: 0 });
  const tileRefs = useRef(new Map<string, SVGGElement | null>());
  const moveTo = (c: number, r: number) => {
    const nc = Math.max(0, Math.min(map.cols - 1, c));
    const nr = Math.max(0, Math.min(map.rows - 1, r));
    setCur({ c: nc, r: nr });
    tileRefs.current.get(`${nc},${nr}`)?.focus();
  };
  const tiles: ReactNode[] = [];
  for (let r = 0; r < map.rows; r++)
    for (let c = 0; c < map.cols; c++) {
      const black = map.tiles[r][c] === 1;
      const rect = <rect x={tbX(c)} y={tbY(r)} width={TB.cell} height={TB.cell} fill={black ? 'var(--bayes-black)' : 'var(--bayes-white)'} stroke="var(--bayes-line)" strokeWidth={1} />;
      if (!onCell) {
        tiles.push(<g key={`${c},${r}`}>{rect}</g>);
        continue;
      }
      const name = cellTitle ? cellTitle(c, r) : `${cellLabel(c, r)} (${black ? 'black' : 'white'})`;
      tiles.push(
        <g
          key={`${c},${r}`}
          ref={(el) => {
            tileRefs.current.set(`${c},${r}`, el);
          }}
          className="bayes-tile-btn"
          role="button"
          tabIndex={c === Math.min(cur.c, map.cols - 1) && r === Math.min(cur.r, map.rows - 1) ? 0 : -1}
          aria-label={name}
          onClick={() => {
            setCur({ c, r });
            onCell(c, r);
          }}
          onKeyDown={(e: KeyboardEvent<SVGGElement>) => {
            const step: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onCell(c, r);
            } else if (step[e.key]) {
              e.preventDefault();
              moveTo(c + step[e.key][0], r + step[e.key][1]);
            }
          }}
        >
          <title>{name}</title>
          {rect}
        </g>
      );
    }
  return (
    <svg
      className="bayes-board"
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      style={maxWidth ? { maxWidth } : undefined}
      // With clickable tiles the board is a group of buttons (an "img" would hide them from assistive tech).
      role={onCell ? 'group' : 'img'}
      aria-label={onCell ? `${ariaLabel}. Arrow keys move between tiles; Enter or Space clicks one.` : ariaLabel}
    >
      {Array.from({ length: map.cols }, (_, c) => (
        <text key={`c${c}`} x={tbCx(c)} y={TB.padT - 7} textAnchor="middle" className="bayes-board-axis">
          {String.fromCharCode(65 + c)}
        </text>
      ))}
      {Array.from({ length: map.rows }, (_, r) => (
        <text key={`r${r}`} x={TB.padL - 7} y={tbCy(r) + 4} textAnchor="end" className="bayes-board-axis">
          {r + 1}
        </text>
      ))}
      {tiles}
      <g pointerEvents="none">{children}</g>
    </svg>
  );
}

/** Grey circle for "the robot may be here" (the paper's start markers), with an optional probability under it. */
export function StartDisc({ c, r, label, black }: { c: number; r: number; label?: string; black: boolean }) {
  return (
    <g>
      <circle cx={tbCx(c)} cy={tbCy(r) - (label ? 3 : 0)} r={11} fill="var(--bayes-robot)" stroke={black ? 'var(--bayes-white)' : 'var(--bayes-black)'} strokeWidth={1.6} />
      {label && (
        <text x={tbCx(c)} y={tbY(r) + TB.cell - 3} textAnchor="middle" className="bayes-board-small" fill={inkOn(black)}>
          {label}
        </text>
      )}
    </g>
  );
}

/**
 * Transition stencil (Figure 2b): the 3 × 3 neighbourhood of the robot's tile with the probability of ending
 * in each cell for one action; an arrow points from the centre to the most likely outcome.
 */
export function Stencil({ moves, title, size = 132 }: { moves: readonly MoveOutcome[]; title?: string; size?: number }) {
  const c = 40;
  const pad = 2;
  const grid: number[][] = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  for (const m of moves) {
    const gc = m.dc + 1;
    const gr = m.dr + 1;
    if (gc >= 0 && gc < 3 && gr >= 0 && gr < 3) grid[gr][gc] += m.p;
  }
  const main = moves.reduce((a, b) => (b.p > a.p ? b : a), moves[0]);
  const ax = pad + c * 1.5;
  const ay = pad + c * 1.5;
  const tx = pad + c * (main.dc + 1.5);
  const ty = pad + c * (main.dr + 1.5);
  const len = Math.hypot(tx - ax, ty - ay);
  const ux = len ? (tx - ax) / len : 0;
  const uy = len ? (ty - ay) / len : 0;
  const W = 3 * c + 2 * pad;
  const label = title ?? `Transition probabilities: ${moves.map((m) => `${moveName(m.dc, m.dr)} ${m.p}`).join(', ')}`;
  return (
    <svg className="bayes-stencil" viewBox={`0 0 ${W} ${W}`} width={size} height={size} role="img" aria-label={label}>
      {grid.map((row, gr) =>
        row.map((p, gc) => (
          <g key={`${gc},${gr}`}>
            <rect x={pad + gc * c} y={pad + gr * c} width={c} height={c} fill="var(--surface)" stroke="var(--text-3)" strokeWidth={1} />
            <text
              x={pad + gc * c + c / 2}
              y={pad + gr * c + (gr === 1 && gc === 1 ? c - 6 : c / 2 + 4)}
              textAnchor="middle"
              className="bayes-stencil-num"
              fill={p > 0 ? 'var(--text)' : 'var(--text-3)'}
              fontWeight={p > 0 ? 700 : 400}
            >
              {Number(p.toFixed(3))}
            </text>
          </g>
        ))
      )}
      {len > 0 && (
        <g stroke="var(--text)" fill="var(--text)">
          <circle cx={ax} cy={ay} r={2.6} stroke="none" />
          <line x1={ax} y1={ay} x2={tx - ux * 10} y2={ty - uy * 10} strokeWidth={1.6} />
          <path
            d={`M${tx - ux * 6} ${ty - uy * 6} L${tx - ux * 13 - uy * 4} ${ty - uy * 13 + ux * 4} L${tx - ux * 13 + uy * 4} ${ty - uy * 13 - ux * 4} Z`}
            stroke="none"
          />
        </g>
      )}
    </svg>
  );
}
