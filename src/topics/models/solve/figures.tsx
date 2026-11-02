// Figures for the models exam-mode problems, drawn from each instance's data (never scanned).
import type { ComponentType } from 'react';
import { velocityMotion, type Pose } from '../../../core/motion';
import { RobotGlyph, WorldGrid, arcPathD, fitView, headD, makeFrame } from '../explore/modelsDraw';
import { g } from '../explore/modelsFmt';

const W = 520;
const H = 300;

export interface FigCmd {
  v: number;
  w: number;
  dt: number;
  g: number;
}

/** Start pose plus a sketch of each command's arc (labelled by number). */
export function velocityFigure(start: Pose, cmds: FigCmd[]): ComponentType {
  const poses: Pose[] = [start];
  const pts: { x: number; y: number }[] = [start];
  for (const c of cmds) {
    const p = poses[poses.length - 1];
    for (let i = 1; i <= 16; i++) pts.push(velocityMotion(p, c.v, c.w, (c.dt * i) / 16));
    poses.push(velocityMotion(p, c.v, c.w, c.dt, c.g));
  }
  const f = makeFrame(fitView(pts, W / H, 0.6, 2), W, H);
  function VelocityFigure() {
    return (
      <svg className="models-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Start pose (${g(start.x)}, ${g(start.y)}) heading ${g(start.theta)} rad and a sketch of ${cmds.length} command arc${cmds.length > 1 ? 's' : ''}.`} style={{ maxWidth: W }}>
        <rect x={0} y={0} width={W} height={H} fill="var(--surface)" />
        <WorldGrid f={f} />
        {cmds.map((c, k) => (
          <path key={k} d={arcPathD(poses[k], c.v, c.w, c.dt, f)} fill="none" stroke="var(--m1)" strokeWidth={2.4} strokeDasharray="7 5" opacity={0.8} />
        ))}
        {poses.slice(1).map((p, k) => (
          <text key={k} className="models-note is-strong" x={f.sx(p.x) + 8} y={f.sy(p.y) - 8} fill="var(--m1)">
            {cmds.length > 1 ? `after ${k + 1}` : 'end'}
          </text>
        ))}
        <RobotGlyph pose={start} f={f} r={0.12} minPx={9} color="var(--accent)" fill="var(--accent-soft)" label={`start (${g(start.x)}, ${g(start.y)}), θ = ${g(start.theta)}`} />
        <text className="models-tick" x={W - 6} y={14} textAnchor="end">
          sketch: work the numbers out by hand
        </text>
      </svg>
    );
  }
  return VelocityFigure;
}

/** Two odometry poses (the measured move) and the new start pose the increments are applied to. */
export function odometryFigure(a: Pose, b: Pose, start: Pose | null): ComponentType {
  const pts = [a, b, ...(start ? [start] : [])];
  const f = makeFrame(fitView(pts, W / H, 0.8, 2), W, H);
  function OdometryFigure() {
    const ax = f.sx(a.x);
    const ay = f.sy(a.y);
    const bx = f.sx(b.x);
    const by = f.sy(b.y);
    return (
      <svg className="models-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Two odometry poses joined by the measured move, and the start pose of the robot the increments are applied to." style={{ maxWidth: W }}>
        <rect x={0} y={0} width={W} height={H} fill="var(--surface)" />
        <WorldGrid f={f} />
        {Math.hypot(bx - ax, by - ay) > 4 && (
          <>
            <line x1={ax} y1={ay} x2={bx} y2={by} stroke="var(--m2)" strokeWidth={2} strokeDasharray="6 4" />
            <path d={headD(ax, ay, bx, by, 8)} fill="var(--m2)" />
          </>
        )}
        <RobotGlyph pose={a} f={f} r={0.1} minPx={8} color="var(--m2)" label="odometry pose at t−1" />
        <RobotGlyph pose={b} f={f} r={0.1} minPx={8} color="var(--m2)" label="odometry pose at t" labelBelow />
        {start && <RobotGlyph pose={start} f={f} r={0.1} minPx={8} color="var(--accent)" fill="var(--accent-soft)" label="robot’s start pose" />}
      </svg>
    );
  }
  return OdometryFigure;
}
