// Static figures for the local-planning exam generators (solve/local.ts), drawn from each instance's data:
// the (v, ω) plane with the admissible box, the current velocity, the dynamic window and candidate samples;
// and a small world sketch (obstacles, robot, goal, influence distance Q*).
import { useId, type ComponentType } from 'react';
import type { Shape, Vec2 } from '../../../core/geom2d';
import { fmt } from '../../../engine/format';

export interface WindowFigureProps {
  vMax: number;
  wMax: number;
  now: { v: number; w: number };
  /** The dynamic window (omit when it is the answer). */
  window?: { v0: number; v1: number; w0: number; w1: number };
  cands?: { label: string; v: number; w: number }[];
}

const FW = 380;
const FH = 230;
const M = { l: 50, r: 14, t: 14, b: 40 };

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}
const overlaps = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

/**
 * Places small labels next to their points without covering another point or label: tries right-above,
 * right-below, left-above, left-below, above and below, and keeps the first spot that is free and inside the frame.
 */
function labelPlacer(points: { x: number; y: number }[], frame: Box, taken: Box[] = []) {
  const busy = [...points.map((p) => ({ x0: p.x - 6, y0: p.y - 6, x1: p.x + 6, y1: p.y + 6 })), ...taken];
  return (px: number, py: number, text: string): { x: number; y: number; anchor: 'start' | 'end' | 'middle' } => {
    const w = text.length * 6.6 + 2;
    const tries: [number, number, 'start' | 'end' | 'middle'][] = [
      [9, -7, 'start'],
      [9, 15, 'start'],
      [-9, -7, 'end'],
      [-9, 15, 'end'],
      [0, -11, 'middle'],
      [0, 21, 'middle'],
    ];
    for (const [dx, dy, anchor] of tries) {
      const x = px + dx;
      const y = py + dy;
      const x0 = anchor === 'start' ? x : anchor === 'end' ? x - w : x - w / 2;
      const b = { x0, y0: y - 10, x1: x0 + w, y1: y + 2 };
      if (b.x0 < frame.x0 || b.x1 > frame.x1 || b.y0 < frame.y0 || b.y1 > frame.y1) continue;
      if (busy.some((o) => overlaps(o, b))) continue;
      busy.push(b);
      return { x, y, anchor };
    }
    return { x: px + tries[0][0], y: py + tries[0][1], anchor: 'start' };
  };
}

function WindowFigure({ vMax, wMax, now, window: win, cands = [] }: WindowFigureProps) {
  const wLo = -wMax * 1.12;
  const wHi = wMax * 1.12;
  const vLo = -0.08 * vMax;
  const vHi = 1.12 * vMax;
  const X = (w: number) => M.l + ((w - wLo) / (wHi - wLo)) * (FW - M.l - M.r);
  const Y = (v: number) => FH - M.b - ((v - vLo) / (vHi - vLo)) * (FH - M.t - M.b);
  const ticksW = [-wMax, 0, wMax];
  const ticksV = [0, vMax / 2, vMax];
  // The box label sits in the top-right corner; keep the point labels off it.
  const boxLabel = { x0: X(wMax) - 160, y0: Y(vMax) - 14, x1: X(wMax), y1: Y(vMax) - 2 };
  const place = labelPlacer(
    [{ x: X(now.w), y: Y(now.v) }, ...cands.map((c) => ({ x: X(c.w), y: Y(c.v) }))],
    { x0: M.l + 2, y0: M.t - 4, x1: FW - 2, y1: FH - M.b - 2 },
    [boxLabel]
  );
  const nowL = place(X(now.w), Y(now.v), 'now');
  const candL = cands.map((c) => place(X(c.w), Y(c.v), c.label));
  return (
    <svg className="figure" viewBox={`0 0 ${FW} ${FH}`} width="100%" style={{ maxWidth: FW }} role="img" aria-label="Velocity space: angular velocity ω across, forward velocity v up, with the admissible box, the current velocity and candidate samples">
      <rect x={M.l} y={M.t} width={FW - M.l - M.r} height={FH - M.t - M.b} fill="none" stroke="var(--border)" />
      {ticksW.map((w) => (
        <g key={`w${w}`}>
          <line x1={X(w)} x2={X(w)} y1={M.t} y2={FH - M.b} stroke="var(--grid)" />
          <text x={X(w)} y={FH - M.b + 15} textAnchor="middle" className="tick">
            {fmt(w, 3)}
          </text>
        </g>
      ))}
      {ticksV.map((v) => (
        <g key={`v${v}`}>
          <line x1={M.l} x2={FW - M.r} y1={Y(v)} y2={Y(v)} stroke="var(--grid)" />
          <text x={M.l - 6} y={Y(v) + 4} textAnchor="end" className="tick">
            {fmt(v, 3)}
          </text>
        </g>
      ))}
      <text x={(M.l + FW - M.r) / 2} y={FH - 6} textAnchor="middle" className="axis-label">
        ω (rad/s)
      </text>
      <text transform={`translate(13 ${(M.t + FH - M.b) / 2}) rotate(-90)`} textAnchor="middle" className="axis-label">
        v (m/s)
      </text>
      <rect x={X(-wMax)} y={Y(vMax)} width={X(wMax) - X(-wMax)} height={Y(0) - Y(vMax)} fill="none" stroke="var(--text-3)" strokeDasharray="5 4" strokeWidth={1.4} />
      <text x={X(wMax) - 4} y={Y(vMax) - 4} textAnchor="end" className="plot-note">
        V_s: 0 ≤ v ≤ v_max, |ω| ≤ ω_max
      </text>
      {win && (
        <rect
          x={X(win.w0)}
          y={Y(win.v1)}
          width={Math.max(1, X(win.w1) - X(win.w0))}
          height={Math.max(1, Y(win.v0) - Y(win.v1))}
          fill="var(--accent)"
          fillOpacity={0.12}
          stroke="var(--accent)"
          strokeWidth={2}
        />
      )}
      <circle cx={X(now.w)} cy={Y(now.v)} r={4.5} fill="var(--text)" />
      <text x={nowL.x} y={nowL.y} textAnchor={nowL.anchor} className="plot-note">
        now
      </text>
      {cands.map((c, i) => (
        <g key={c.label}>
          <circle cx={X(c.w)} cy={Y(c.v)} r={5} fill="var(--surface)" stroke="var(--m1)" strokeWidth={2} />
          <text x={candL[i].x} y={candL[i].y} textAnchor={candL[i].anchor} className="plot-note" style={{ fill: 'var(--m1)', fontWeight: 700 }}>
            {c.label}
          </text>
        </g>
      ))}
    </svg>
  );
}

export function windowFigure(p: WindowFigureProps): ComponentType {
  const Fig = () => <WindowFigure {...p} />;
  Fig.displayName = 'DwaWindowFigure';
  return Fig;
}

export interface SceneFigureProps {
  /** World size (m). */
  w: number;
  h: number;
  obstacles: Shape[];
  robot: Vec2;
  /** Heading of a differential-drive robot (omit for a point robot). */
  theta?: number;
  goal: Vec2;
  /** Draw the influence distance Q* around each obstacle. */
  qStar?: number;
  /** Dimension lines with a label, in world coordinates. */
  dims?: { a: Vec2; b: Vec2; label: string }[];
  ariaLabel: string;
}

function SceneFigure({ w, h, obstacles, robot, theta, goal, qStar, dims = [], ariaLabel }: SceneFigureProps) {
  const arrowId = `${useId().replace(/:/g, '')}-arrow`;
  const S = 40;
  const W = w * S;
  const H = h * S;
  const X = (x: number) => x * S;
  const Y = (y: number) => H - y * S;
  const legend = qStar !== undefined;
  // Put the goal's label on whichever side is clear of the obstacles (world-space box of the label).
  const hitsObstacle = (x0: number, x1: number, y0: number, y1: number) =>
    obstacles.some((o) => {
      const b = o.kind === 'circle' ? { x0: o.x - o.r, x1: o.x + o.r, y0: o.y - o.r, y1: o.y + o.r } : o.kind === 'rect' ? { x0: o.x, x1: o.x + o.w, y0: o.y, y1: o.y + o.h } : null;
      return !!b && b.x0 < x1 && x0 < b.x1 && b.y0 < y1 && y0 < b.y1;
    });
  const goalLeft = hitsObstacle(goal.x + 0.25, goal.x + 1.1, goal.y + 0.1, goal.y + 0.5) && !hitsObstacle(goal.x - 1.1, goal.x - 0.25, goal.y + 0.1, goal.y + 0.5);
  return (
    <svg className="figure" viewBox={`-6 -6 ${W + 12} ${H + 12 + (legend ? 18 : 0)}`} width="100%" style={{ maxWidth: 440 }} role="img" aria-label={ariaLabel}>
      <defs>
        <marker id={arrowId} viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M0 0 L10 5 L0 10 z" style={{ fill: 'var(--m2)' }} />
        </marker>
        <clipPath id={`${arrowId}-clip`}>
          <rect x={0} y={0} width={W} height={H} />
        </clipPath>
      </defs>
      <rect x={0} y={0} width={W} height={H} fill="var(--surface-2)" stroke="var(--border)" />
      {qStar !== undefined && (
        // Each obstacle's influence zone, translucent so that overlapping zones (where two pushes add) look darker.
        <g clipPath={`url(#${arrowId}-clip)`}>
          {obstacles.map((o, i) =>
            o.kind === 'circle' ? (
              <circle key={`q${i}`} cx={X(o.x)} cy={Y(o.y)} r={(o.r + qStar) * S} style={{ fill: 'var(--m2)', fillOpacity: 0.13, stroke: 'var(--m2)', strokeOpacity: 0.7 }} strokeDasharray="4 4" />
            ) : o.kind === 'rect' ? (
              <rect
                key={`q${i}`}
                x={X(o.x - qStar)}
                y={Y(o.y + o.h + qStar)}
                width={(o.w + 2 * qStar) * S}
                height={(o.h + 2 * qStar) * S}
                rx={qStar * S}
                style={{ fill: 'var(--m2)', fillOpacity: 0.13, stroke: 'var(--m2)', strokeOpacity: 0.7 }}
                strokeDasharray="4 4"
              />
            ) : null
          )}
        </g>
      )}
      {obstacles.map((o, i) =>
        o.kind === 'circle' ? (
          <circle key={i} cx={X(o.x)} cy={Y(o.y)} r={o.r * S} fill="var(--text-2)" />
        ) : o.kind === 'rect' ? (
          <rect key={i} x={X(o.x)} y={Y(o.y + o.h)} width={o.w * S} height={o.h * S} fill="var(--text-2)" />
        ) : (
          <polygon key={i} points={o.pts.map((p) => `${X(p.x)},${Y(p.y)}`).join(' ')} fill="var(--text-2)" />
        )
      )}
      {dims.map((d, i) => {
        // horizontal dimension: label centred above the line; vertical: label to its right
        const horiz = Math.abs(d.b.x - d.a.x) >= Math.abs(d.b.y - d.a.y);
        const mx = (X(d.a.x) + X(d.b.x)) / 2;
        const my = (Y(d.a.y) + Y(d.b.y)) / 2;
        return (
          <g key={`d${i}`}>
            <line x1={X(d.a.x)} y1={Y(d.a.y)} x2={X(d.b.x)} y2={Y(d.b.y)} stroke="var(--m2)" strokeWidth={1.6} markerStart={`url(#${arrowId})`} markerEnd={`url(#${arrowId})`} />
            <text x={horiz ? mx : mx + 7} y={horiz ? my - 7 : my + 4} textAnchor={horiz ? 'middle' : 'start'} className="plot-note" style={{ fill: 'var(--m2)', fontWeight: 600 }}>
              {d.label}
            </text>
          </g>
        );
      })}
      <circle cx={X(goal.x)} cy={Y(goal.y)} r={9} fill="none" stroke="var(--m3)" strokeWidth={2.5} />
      <circle cx={X(goal.x)} cy={Y(goal.y)} r={3} fill="var(--m3)" />
      <text x={X(goal.x) + (goalLeft ? -12 : 12)} y={Y(goal.y) - 8} textAnchor={goalLeft ? 'end' : 'start'} className="plot-note" style={{ fill: 'var(--m3)', fontWeight: 600 }}>
        goal
      </text>
      <circle cx={X(robot.x)} cy={Y(robot.y)} r={theta === undefined ? 6 : 10} fill="var(--surface)" stroke="var(--accent)" strokeWidth={2.5} />
      {theta !== undefined && <line x1={X(robot.x)} y1={Y(robot.y)} x2={X(robot.x) + 14 * Math.cos(theta)} y2={Y(robot.y) - 14 * Math.sin(theta)} stroke="var(--accent)" strokeWidth={2.5} />}
      <text x={X(robot.x) - 6} y={Y(robot.y) + 24} className="plot-note" style={{ fill: 'var(--accent)', fontWeight: 600 }}>
        robot
      </text>
      {legend && (
        <g>
          <rect x={0} y={H + 7} width={22} height={10} rx={2} style={{ fill: 'var(--m2)', fillOpacity: 0.13, stroke: 'var(--m2)', strokeOpacity: 0.7 }} strokeDasharray="4 4" />
          <text x={28} y={H + 16} className="plot-note">
            {`within Q* = ${fmt(qStar ?? 0, 3)} m of an obstacle (darker: zones overlap)`}
          </text>
        </g>
      )}
    </svg>
  );
}

export function sceneFigure(p: SceneFigureProps): ComponentType {
  const Fig = () => <SceneFigure {...p} />;
  Fig.displayName = 'LocalSceneFigure';
  return Fig;
}
