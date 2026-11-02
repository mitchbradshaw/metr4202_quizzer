// Static figures for the local-planning exam generators (solve/local.ts), drawn from each instance's data:
// the (v, ω) plane with the admissible box, the current velocity, the dynamic window and candidate samples;
// and a small world sketch (obstacles, robot, goal, influence distance Q*).
import type { ComponentType } from 'react';
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

function WindowFigure({ vMax, wMax, now, window: win, cands = [] }: WindowFigureProps) {
  const wLo = -wMax * 1.12;
  const wHi = wMax * 1.12;
  const vLo = -0.08 * vMax;
  const vHi = 1.12 * vMax;
  const X = (w: number) => M.l + ((w - wLo) / (wHi - wLo)) * (FW - M.l - M.r);
  const Y = (v: number) => FH - M.b - ((v - vLo) / (vHi - vLo)) * (FH - M.t - M.b);
  const ticksW = [-wMax, 0, wMax];
  const ticksV = [0, vMax / 2, vMax];
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
      <text x={X(now.w) + 7} y={Y(now.v) - 6} className="plot-note">
        now
      </text>
      {cands.map((c) => (
        <g key={c.label}>
          <circle cx={X(c.w)} cy={Y(c.v)} r={5} fill="var(--surface)" stroke="var(--m1)" strokeWidth={2} />
          <text x={X(c.w) + 7} y={Y(c.v) + 14} className="plot-note" fill="var(--m1)">
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
  const S = 40;
  const W = w * S;
  const H = h * S;
  const X = (x: number) => x * S;
  const Y = (y: number) => H - y * S;
  return (
    <svg className="figure" viewBox={`-6 -6 ${W + 12} ${H + 12}`} width="100%" style={{ maxWidth: 440 }} role="img" aria-label={ariaLabel}>
      <rect x={0} y={0} width={W} height={H} fill="var(--surface-2)" stroke="var(--border)" />
      {qStar !== undefined &&
        obstacles.map((o, i) =>
          o.kind === 'circle' ? (
            <circle key={`q${i}`} cx={X(o.x)} cy={Y(o.y)} r={(o.r + qStar) * S} fill="none" stroke="var(--text-3)" strokeDasharray="4 4" />
          ) : o.kind === 'rect' ? (
            <rect
              key={`q${i}`}
              x={X(o.x - qStar)}
              y={Y(o.y + o.h + qStar)}
              width={(o.w + 2 * qStar) * S}
              height={(o.h + 2 * qStar) * S}
              rx={qStar * S}
              fill="none"
              stroke="var(--text-3)"
              strokeDasharray="4 4"
            />
          ) : null
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
      {dims.map((d, i) => (
        <g key={`d${i}`}>
          <line x1={X(d.a.x)} y1={Y(d.a.y)} x2={X(d.b.x)} y2={Y(d.b.y)} stroke="var(--m2)" strokeWidth={1.6} markerStart="url(#plan-local-fig-arrow)" markerEnd="url(#plan-local-fig-arrow)" />
          <text x={(X(d.a.x) + X(d.b.x)) / 2 + 6} y={(Y(d.a.y) + Y(d.b.y)) / 2 + 4} className="plot-note" fill="var(--m2)">
            {d.label}
          </text>
        </g>
      ))}
      <defs>
        <marker id="plan-local-fig-arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M0 0 L10 5 L0 10 z" fill="var(--m2)" />
        </marker>
      </defs>
      <circle cx={X(goal.x)} cy={Y(goal.y)} r={9} fill="none" stroke="var(--m3)" strokeWidth={2.5} />
      <circle cx={X(goal.x)} cy={Y(goal.y)} r={3} fill="var(--m3)" />
      <text x={X(goal.x) + 12} y={Y(goal.y) - 8} className="plot-note" fill="var(--m3)">
        goal
      </text>
      <circle cx={X(robot.x)} cy={Y(robot.y)} r={theta === undefined ? 6 : 10} fill="var(--surface)" stroke="var(--accent)" strokeWidth={2.5} />
      {theta !== undefined && <line x1={X(robot.x)} y1={Y(robot.y)} x2={X(robot.x) + 14 * Math.cos(theta)} y2={Y(robot.y) - 14 * Math.sin(theta)} stroke="var(--accent)" strokeWidth={2.5} />}
      <text x={X(robot.x) - 6} y={Y(robot.y) + 24} className="plot-note" fill="var(--accent)">
        robot
      </text>
    </svg>
  );
}

export function sceneFigure(p: SceneFigureProps): ComponentType {
  const Fig = () => <SceneFigure {...p} />;
  Fig.displayName = 'LocalSceneFigure';
  return Fig;
}
