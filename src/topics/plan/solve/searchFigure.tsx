// Figures for the search drills (plan-search-order, plan-admissible, plan-bfs-weighted).
//   makeGraphFigure: the road graph drawn by the A* activities' RoadGraph, so every planning figure looks alike
//                    (towns, road lengths, start/goal rings, optional h beside each town).
//   makeManhattanFigure: the 2023 Q25 picture, drawn from the instance: robot R and goal G on a 1 m grid, the
//                    Manhattan route (along x, then along y) dashed, the straight line (free motion) solid, or the
//                    eight allowed moves when the robot lives on an 8-connected grid.
import type { ComponentType } from 'react';
import { RoadGraph } from '../explore/astarGraph';
import type { MapDef } from '../explore/astarMaps';

export function makeGraphFigure(map: MapDef, start: string, goal: string, opts: { h?: Record<string, number>; caption: string }): ComponentType {
  const table = opts.h;
  const hOf = table ? (n: string) => table[n] : undefined;
  function SearchGraphFigure() {
    return (
      <figure style={{ margin: 0 }}>
        <RoadGraph
          map={map}
          start={start}
          goal={goal}
          h={hOf}
          showValues={false}
          figure
          ariaLabel={`Road graph from ${map.name(start)} to ${map.name(goal)} with road lengths in ${map.unit}${table ? ' and h beside each node' : ''}`}
        />
        <figcaption className="muted small">{opts.caption}</figcaption>
      </figure>
    );
  }
  return SearchGraphFigure;
}

export interface PlaneSpec {
  /** Robot and goal positions (m, integers, y up). */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** 8-connected grid of 1 m cells (diagonal √2) instead of free motion in the plane. */
  grid8: boolean;
}

const S = 46; // viewBox units per metre

const MOVES: [number, number][] = [
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
  [0, -1],
  [1, -1],
];

export function makeManhattanFigure(p: PlaneSpec): ComponentType {
  // The |Δy| label sits beside the vertical leg, on the side away from the robot: leave 3 m of grid there.
  const legLeft = p.x1 < p.x0;
  const minX = Math.min(p.x0, p.x1) - (legLeft ? 3 : 1);
  const maxX = Math.max(p.x0, p.x1) + (legLeft ? 1 : 3);
  const minY = Math.min(p.y0, p.y1) - 1;
  const maxY = Math.max(p.y0, p.y1) + 1;
  // On the grid world positions are cell centres, so the drawing reaches half a cell past them.
  const inset = p.grid8 ? S / 2 : 0;
  const padL = 34 + inset;
  const padR = 18 + inset + (p.grid8 ? 2.6 * S : 0);
  const padT = 18 + inset;
  const padB = 34 + inset;
  const W = padL + (maxX - minX) * S + padR;
  const H = padT + (maxY - minY) * S + padB;
  const X = (x: number) => padL + (x - minX) * S;
  const Y = (y: number) => padT + (maxY - y) * S;
  const dx = p.x1 - p.x0;
  const dy = p.y1 - p.y0;
  const xs: number[] = [];
  for (let x = minX; x <= maxX; x++) xs.push(x);
  const ys: number[] = [];
  for (let y = minY; y <= maxY; y++) ys.push(y);
  // The Manhattan route: along x at the robot's height, then along y at the goal's x.
  const corner = { x: p.x1, y: p.y0 };
  const below = dy > 0; // the x-leg label goes on the side away from the goal
  const right = legLeft; // the y-leg label goes on the side away from the robot (anchor 'end' = to the left)
  const glyph = { x: X(maxX) + inset + 1.45 * S, y: (Y(maxY) + Y(minY)) / 2 };
  // The |Δx| label sits at the middle of the x leg, but on a short leg it would run into the robot marker:
  // slide it towards (and past) the corner, away from R.
  const dxLabelHalf = (`|Δx| = ${Math.abs(dx)} m`.length * 8.4) / 2;
  const dxMid = Math.max((Math.abs(dx) * S) / 2, dxLabelHalf + 20);
  const dxLabelX = X(p.x0) + Math.sign(p.x1 - p.x0) * dxMid;
  const tickStyle = { fill: 'var(--text-3)', fontSize: 12, fontFamily: 'var(--mono)' };

  function ManhattanFigure() {
    return (
      <figure style={{ margin: 0 }}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          style={{ display: 'block', maxWidth: Math.min(600, Math.round(W * 1.05)), height: 'auto' }}
          role="img"
          aria-label={`Robot R at (${p.x0}, ${p.y0}) m and goal G at (${p.x1}, ${p.y1}) m. Dashed: the Manhattan route along x then y.${p.grid8 ? ' The robot moves on an 8-connected grid of 1 m cells.' : ' Solid: the straight line.'}`}
        >
          <defs>
            <marker id="plan-man-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" style={{ fill: 'var(--text-2)' }} />
            </marker>
          </defs>
          {/* grid: cells on the grid world, 1 m lines on the open floor */}
          {p.grid8
            ? xs.flatMap((x) =>
                ys.map((y) => (
                  <rect
                    key={`c${x},${y}`}
                    x={X(x) - S / 2}
                    y={Y(y) - S / 2}
                    width={S}
                    height={S}
                    style={{ fill: (x + y) % 2 === 0 ? 'var(--surface-2)' : 'var(--surface)', stroke: 'var(--border)', strokeWidth: 1 }}
                  />
                ))
              )
            : [
                ...xs.map((x) => <line key={`x${x}`} x1={X(x)} y1={Y(maxY)} x2={X(x)} y2={Y(minY)} style={{ stroke: 'var(--border)', strokeWidth: 1 }} />),
                ...ys.map((y) => <line key={`y${y}`} x1={X(minX)} y1={Y(y)} x2={X(maxX)} y2={Y(y)} style={{ stroke: 'var(--border)', strokeWidth: 1 }} />),
              ]}
          {/* axis numbers (metres); the margin cells left of x = 0 stay unlabelled */}
          {xs.filter((x) => x >= 0).map((x) => (
            <text key={`tx${x}`} x={X(x)} y={Y(minY) + inset + 18} textAnchor="middle" style={tickStyle}>
              {x}
            </text>
          ))}
          {ys.filter((y) => y >= 0).map((y) => (
            <text key={`ty${y}`} x={X(minX) - inset - 8} y={Y(y) + 4} textAnchor="end" style={tickStyle}>
              {y}
            </text>
          ))}
          <text x={X(maxX) + inset} y={H - 4} textAnchor="end" style={{ fill: 'var(--text-3)', fontSize: 12 }}>
            x (m)
          </text>
          <text x={X(minX) - inset + 2} y={12} textAnchor="start" style={{ fill: 'var(--text-3)', fontSize: 12 }}>
            y (m)
          </text>
          {/* the route Manhattan prices */}
          <polyline
            points={`${X(p.x0)},${Y(p.y0)} ${X(corner.x)},${Y(corner.y)} ${X(p.x1)},${Y(p.y1)}`}
            style={{ fill: 'none', stroke: 'var(--m2)', strokeWidth: 3, strokeDasharray: '8 6', strokeLinejoin: 'round' }}
          />
          {/* the straight line (free motion only) */}
          {!p.grid8 && <line x1={X(p.x0)} y1={Y(p.y0)} x2={X(p.x1)} y2={Y(p.y1)} style={{ stroke: 'var(--m1)', strokeWidth: 3 }} />}
          {/* leg labels */}
          <text x={dxLabelX} y={Y(p.y0) + (below ? 22 : -12)} textAnchor="middle" style={{ fill: 'var(--m2)', fontSize: 14, fontWeight: 600 }}>
            |Δx| = {Math.abs(dx)} m
          </text>
          <text x={X(p.x1) + (right ? -12 : 12)} y={Y((p.y0 + p.y1) / 2) + 5} textAnchor={right ? 'end' : 'start'} style={{ fill: 'var(--m2)', fontSize: 14, fontWeight: 600 }}>
            |Δy| = {Math.abs(dy)} m
          </text>
          {/* the allowed moves on the grid world */}
          {p.grid8 && (
            <g transform={`translate(${glyph.x} ${glyph.y})`} aria-hidden="true">
              <circle r={S * 0.95} style={{ fill: 'var(--surface)', stroke: 'var(--border)', strokeWidth: 1 }} />
              {MOVES.map(([mx, my]) => {
                const L = S * 0.6;
                const n = Math.hypot(mx, my);
                return <line key={`m${mx},${my}`} x1={0} y1={0} x2={(mx / n) * L} y2={(-my / n) * L} style={{ stroke: 'var(--text-2)', strokeWidth: 1.6 }} markerEnd="url(#plan-man-arrow)" />;
              })}
              <circle r={3} style={{ fill: 'var(--text-2)' }} />
              <text x={S * 0.66} y={14} textAnchor="start" style={{ fill: 'var(--text-2)', fontSize: 12 }}>
                1
              </text>
              <text x={S * 0.5} y={-S * 0.5} textAnchor="start" style={{ fill: 'var(--text-2)', fontSize: 12 }}>
                √2
              </text>
              <text y={S * 0.95 + 16} textAnchor="middle" style={{ fill: 'var(--text-3)', fontSize: 12 }}>
                allowed moves
              </text>
            </g>
          )}
          {/* robot and goal */}
          <g transform={`translate(${X(p.x0)} ${Y(p.y0)})`}>
            <circle r={14} style={{ fill: 'var(--accent)' }} />
            <text y={5} textAnchor="middle" style={{ fill: 'var(--surface)', fontSize: 14, fontWeight: 700 }}>
              R
            </text>
          </g>
          <g transform={`translate(${X(p.x1)} ${Y(p.y1)})`}>
            <circle r={14} style={{ fill: 'var(--surface)', stroke: 'var(--ok)', strokeWidth: 3 }} />
            <text y={5} textAnchor="middle" style={{ fill: 'var(--ok)', fontSize: 14, fontWeight: 700 }}>
              G
            </text>
          </g>
        </svg>
        <figcaption className="muted small">
          {p.grid8
            ? 'Grid of 1 m cells; the robot may step to any of its 8 neighbours (straight 1 m, diagonal √2 m). Dashed: the route Manhattan prices (along x, then along y). No obstacles.'
            : 'Open floor with 1 m grid lines; the robot can drive in any direction. Dashed: the route Manhattan prices (along x, then along y). Solid: the straight line. No obstacles.'}
        </figcaption>
      </figure>
    );
  }
  return ManhattanFigure;
}
