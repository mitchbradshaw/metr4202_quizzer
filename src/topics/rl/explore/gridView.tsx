// SVG view of a gridworld: Q as four triangles per cell (one per action) or V as a whole cell, coloured on a
// diverging scale (green positive, red negative), the greedy policy as arrows, value iteration's optimal policy as
// dashed ghost arrows, the robot, and highlights for the Q-learning update in progress. Cells are memoised so a
// step of the learner only re-renders the cells whose numbers changed.
import { memo, type ReactNode } from 'react';
import { FREE, TERMINAL, WALL, cellCol, cellRow, type GridWorld } from '../../../core/rl';
import { cellName, t } from './rlCommon';

export const C = 100;
export const PAD_L = 22;
export const PAD_T = 20;

export type NumMode = 'q' | 'v' | 'off';

/** Direction vectors in screen units (N, E, S, W). */
const VX = [0, 1, 0, -1];
const VY = [-1, 0, 1, 0];

export const cellX = (g: GridWorld, s: number) => PAD_L + cellCol(g, s) * C;
export const cellY = (g: GridWorld, s: number) => PAD_T + cellRow(g, s) * C;

/** Triangle corners for action a of the cell at (x, y). */
function tri(x: number, y: number, a: number): string {
  const cx = x + C / 2;
  const cy = y + C / 2;
  const p = [
    [x, y, x + C, y],
    [x + C, y, x + C, y + C],
    [x + C, y + C, x, y + C],
    [x, y + C, x, y],
  ][a];
  return `${p[0]},${p[1]} ${p[2]},${p[3]} ${cx},${cy}`;
}
const TXT = [
  [50, 23],
  [79, 55],
  [50, 87],
  [21, 55],
];

function heatFill(v: number, scale: number): { fill: string; opacity: number } {
  if (!Number.isFinite(v) || Math.abs(v) < 1e-9) return { fill: 'transparent', opacity: 0 };
  return { fill: v > 0 ? 'var(--ok)' : 'var(--bad)', opacity: Math.min(1, Math.abs(v) / scale) * 0.62 };
}

/** Arrow from the cell centre in direction a (length L), as path data for shaft + head. */
export function arrowPath(x: number, y: number, a: number, L = 30, head = 9): { shaft: string; head: string } {
  const cx = x + C / 2;
  const cy = y + C / 2;
  const x0 = cx - (VX[a] * L) / 2;
  const y0 = cy - (VY[a] * L) / 2;
  const x1 = cx + (VX[a] * L) / 2;
  const y1 = cy + (VY[a] * L) / 2;
  const px = -VY[a];
  const py = VX[a];
  const hx = x1 + VX[a] * 2;
  const hy = y1 + VY[a] * 2;
  return {
    shaft: `M${x0} ${y0}L${x1 - VX[a] * head * 0.6} ${y1 - VY[a] * head * 0.6}`,
    head: `M${hx} ${hy}L${x1 - VX[a] * head + px * head * 0.62} ${y1 - VY[a] * head + py * head * 0.62}L${x1 - VX[a] * head - px * head * 0.62} ${y1 - VY[a] * head - py * head * 0.62}Z`,
  };
}

interface CellProps {
  s: number;
  x: number;
  y: number;
  kind: number;
  term: number;
  q0: number;
  q1: number;
  q2: number;
  q3: number;
  v: number;
  heat: 'q' | 'v';
  nums: NumMode;
  scale: number;
  arrow: number;
  ghost: number;
  isStart: boolean;
  selected: boolean;
  label: string;
  onPick?: (s: number) => void;
}

const Cell = memo(function Cell({ s, x, y, kind, term, q0, q1, q2, q3, v, heat, nums, scale, arrow, ghost, isStart, selected, label, onPick }: CellProps) {
  if (kind === WALL) return <rect x={x} y={y} width={C} height={C} className="rl-wall" />;
  if (kind === TERMINAL) {
    const good = term > 0;
    return (
      <g>
        <rect x={x} y={y} width={C} height={C} className={good ? 'rl-term-good' : 'rl-term-bad'} />
        <text x={x + C / 2} y={y + C / 2 + 9} textAnchor="middle" className="rl-term-label">
          {term > 0 ? `+${term}` : t(term, term % 1 === 0 ? 0 : 1)}
        </text>
      </g>
    );
  }
  const qs = [q0, q1, q2, q3];
  const parts: ReactNode[] = [];
  parts.push(<rect key="bg" x={x} y={y} width={C} height={C} className="rl-cell" />);
  if (heat === 'q') {
    qs.forEach((q, a) => {
      const h = heatFill(q, scale);
      if (h.opacity > 0) parts.push(<polygon key={`t${a}`} points={tri(x, y, a)} fill={h.fill} fillOpacity={h.opacity} />);
    });
    parts.push(<path key="diag" d={`M${x} ${y}L${x + C} ${y + C}M${x + C} ${y}L${x} ${y + C}`} className="rl-diag" />);
  } else {
    const h = heatFill(v, scale);
    if (h.opacity > 0) parts.push(<rect key="vh" x={x} y={y} width={C} height={C} fill={h.fill} fillOpacity={h.opacity} />);
  }
  if (nums === 'q')
    qs.forEach((q, a) =>
      parts.push(
        <text key={`n${a}`} x={x + TXT[a][0]} y={y + TXT[a][1] + 4} textAnchor="middle" className="rl-qnum">
          {t(q, 2)}
        </text>
      )
    );
  if (ghost >= 0) {
    const p = arrowPath(x, y, ghost, 44, 11);
    parts.push(<path key="gh" d={p.shaft + p.head} className="rl-ghost" />);
  }
  if (arrow >= 0) {
    const p = arrowPath(x, y, arrow, nums === 'v' ? 26 : 30);
    const dy = nums === 'v' ? -16 : 0;
    parts.push(
      <g key="ar" transform={`translate(0 ${dy})`} className="rl-arrow">
        <path d={p.shaft} />
        <path d={p.head} className="rl-arrow-head" />
      </g>
    );
  }
  if (nums === 'v')
    parts.push(
      <text key="v" x={x + C / 2} y={y + C / 2 + 26} textAnchor="middle" className="rl-vnum">
        {t(v, 2)}
      </text>
    );
  if (isStart)
    parts.push(
      <text key="S" x={x + 7} y={y + 16} className="rl-start">
        S
      </text>
    );
  if (selected) parts.push(<rect key="sel" x={x + 2} y={y + 2} width={C - 4} height={C - 4} className="rl-sel" />);
  return (
    <g
      className={onPick ? 'rl-cell-g is-click' : 'rl-cell-g'}
      onClick={onPick ? () => onPick(s) : undefined}
      role={onPick ? 'button' : undefined}
      tabIndex={onPick ? 0 : undefined}
      aria-label={onPick ? `Cell ${label}: inspect` : undefined}
      onKeyDown={onPick ? (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onPick(s)) : undefined}
    >
      {parts}
    </g>
  );
});

export interface GridViewProps {
  g: GridWorld;
  /** Q table (row-major s * 4 + a) used for the triangles / arrows, or null. */
  Q: ArrayLike<number> | null;
  /** V per state (V mode heat and numbers). */
  V: ArrayLike<number> | null;
  heat: 'q' | 'v';
  nums: NumMode;
  /** Greedy arrow per state (−1 none). */
  arrows: ArrayLike<number> | null;
  /** Ghost (optimal) arrow per state (−1 none). */
  ghosts?: ArrayLike<number> | null;
  selected?: number;
  onPick?: (s: number) => void;
  /** Extra SVG drawn on top (agent, highlights). */
  over?: ReactNode;
  /** Max rendered height in px. */
  maxH?: number;
  ariaLabel: string;
  version?: number;
}

export function GridView({ g, Q, V, heat, nums, arrows, ghosts, selected = -1, onPick, over, maxH = 470, ariaLabel }: GridViewProps) {
  const W = PAD_L + g.cols * C + 4;
  const H = PAD_T + g.rows * C + 4;
  let scale = 0;
  for (let s = 0; s < g.kind.length; s++) if (g.kind[s] === TERMINAL) scale = Math.max(scale, Math.abs(g.termReward[s]));
  scale = Math.max(0.5, scale);
  const cells: ReactNode[] = [];
  for (let s = 0; s < g.cols * g.rows; s++) {
    const x = cellX(g, s);
    const y = cellY(g, s);
    const k = g.kind[s];
    cells.push(
      <Cell
        key={s}
        s={s}
        x={x}
        y={y}
        kind={k}
        term={g.termReward[s]}
        q0={Q ? Q[s * 4] : 0}
        q1={Q ? Q[s * 4 + 1] : 0}
        q2={Q ? Q[s * 4 + 2] : 0}
        q3={Q ? Q[s * 4 + 3] : 0}
        v={V ? V[s] : 0}
        heat={heat}
        nums={nums}
        scale={scale}
        arrow={k === FREE && arrows ? arrows[s] : -1}
        ghost={k === FREE && ghosts ? ghosts[s] : -1}
        isStart={s === g.start}
        selected={s === selected}
        label={cellName(g, s)}
        onPick={k === FREE ? onPick : undefined}
      />
    );
  }
  return (
    <svg className="rl-grid-svg" viewBox={`0 0 ${W} ${H}`} style={{ maxHeight: maxH, maxWidth: (maxH * W) / H }} role="img" aria-label={ariaLabel}>
      {Array.from({ length: g.cols }, (_, c) => (
        <text key={`c${c}`} x={PAD_L + c * C + C / 2} y={PAD_T - 6} textAnchor="middle" className="rl-axis">
          {String.fromCharCode(65 + c)}
        </text>
      ))}
      {Array.from({ length: g.rows }, (_, r) => (
        <text key={`r${r}`} x={PAD_L - 7} y={PAD_T + r * C + C / 2 + 5} textAnchor="end" className="rl-axis">
          {r + 1}
        </text>
      ))}
      {cells}
      <rect x={PAD_L} y={PAD_T} width={g.cols * C} height={g.rows * C} className="rl-frame" />
      {over}
    </svg>
  );
}

/** Greedy arrow per state from a Q table: −1 where all four values are (nearly) equal (nothing learned yet). */
export function qArrows(g: GridWorld, Q: ArrayLike<number>): Int8Array {
  const out = new Int8Array(g.cols * g.rows).fill(-1);
  for (let s = 0; s < out.length; s++) {
    if (g.kind[s] !== FREE) continue;
    let best = 0;
    let lo = Infinity;
    for (let a = 0; a < 4; a++) {
      if (Q[s * 4 + a] > Q[s * 4 + best]) best = a;
      lo = Math.min(lo, Q[s * 4 + a]);
    }
    if (Q[s * 4 + best] - lo > 1e-9) out[s] = best;
  }
  return out;
}
