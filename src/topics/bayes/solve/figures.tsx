// Figures for the bayes exam-mode generators, drawn from each instance (never scanned):
//   makeGridFigure      the 2024 Q28 picture: the tile map with the possible starting cells as grey circles, and
//                       the transition stencil of the action beside it;
//   makeCorridorFigure  a short corridor of numbered cells with doors and the starting belief.
import type { ComponentType } from 'react';
import type { MoveOutcome, TileMap } from '../../../core/gridloc';
import { cellLabel } from '../../../core/gridloc';
import { Rich } from '../../../ui/Rich';
import { StartDisc, Stencil, TileBoard } from '../explore/tileBoard';
import { num } from './common';

export function makeGridFigure(o: { map: TileMap; starts: { c: number; r: number; p: number }[]; moves: MoveOutcome[]; action: string; showP: boolean }): ComponentType {
  const { map, starts, moves, action, showP } = o;
  const startsTxt = starts.map((s) => cellLabel(s.c, s.r)).join(', ');
  function GridFigure() {
    return (
      <figure className="bayes-figure">
        <div className="bayes-figure-part" style={{ flex: '1 1 360px', maxWidth: 470 }}>
          <TileBoard map={map} ariaLabel={`Known map of ${map.cols} by ${map.rows} black and white tiles; possible starting cells ${startsTxt}`}>
            {starts.map((s) => (
              <StartDisc key={`${s.c},${s.r}`} c={s.c} r={s.r} black={map.tiles[s.r][s.c] === 1} label={showP ? num(s.p, 2) : undefined} />
            ))}
          </TileBoard>
          <span>(a) known map; grey circles = possible starting cells</span>
        </div>
        <div className="bayes-figure-part">
          <Stencil moves={moves} size={128} />
          <span>
            <Rich text={`(b) $u_1$ = ${action}, from the centre tile`} inline />
          </span>
        </div>
        <figcaption className="muted small">
          <Rich text="Columns are letters and rows are numbers (C3 = column C, row 3). Up moves towards row 1." inline />
        </figcaption>
      </figure>
    );
  }
  return GridFigure;
}

export function makeCorridorFigure(o: { n: number; doors: boolean[]; prior: number[] }): ComponentType {
  const { n, doors, prior } = o;
  const C = 46;
  const padL = 8;
  const W = padL * 2 + n * C;
  const H = 104;
  const wallY = 22;
  const floorY = 70;
  function CorridorFigure() {
    return (
      <figure className="bayes-figure">
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: Math.min(560, W * 1.1) }} role="img" aria-label={`Corridor of ${n} cells; doors at cells ${doors.map((d, i) => (d ? i + 1 : 0)).filter(Boolean).join(', ')}`}>
          <rect x={padL} y={wallY} width={n * C} height={floorY - wallY} fill="var(--surface-2)" stroke="var(--text-3)" />
          {Array.from({ length: n }, (_, i) => {
            const x = padL + i * C;
            return (
              <g key={i}>
                <line x1={x} x2={x} y1={wallY} y2={floorY + 14} stroke="var(--text-3)" strokeWidth={i === 0 ? 1.4 : 0.8} strokeDasharray={i === 0 ? undefined : '3 3'} />
                {doors[i] && (
                  <g>
                    <rect x={x + 10} y={wallY + 6} width={C - 20} height={floorY - wallY - 6} fill="var(--m2)" opacity={0.85} rx={2} />
                    <circle cx={x + C - 15} cy={(wallY + floorY) / 2 + 4} r={2} fill="var(--surface)" />
                  </g>
                )}
                <text x={x + C / 2} y={floorY + 14} textAnchor="middle" className="bayes-board-axis">
                  {i + 1}
                </text>
                {prior[i] > 0 && (
                  <text x={x + C / 2} y={14} textAnchor="middle" className="bayes-board-num" fill="var(--m1)">
                    {num(prior[i], 3)}
                  </text>
                )}
              </g>
            );
          })}
          <line x1={padL + n * C} x2={padL + n * C} y1={wallY} y2={floorY + 14} stroke="var(--text-3)" strokeWidth={1.4} />
          <text x={padL} y={H - 4} className="bayes-board-axis">
            starting belief above each cell; orange = door
          </text>
        </svg>
      </figure>
    );
  }
  return CorridorFigure;
}
