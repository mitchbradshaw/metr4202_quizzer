// Problem figures for the plan-rrtstar and plan-steer generators, drawn from each instance's data:
// the partly built tree with its printed edge lengths (2025 Q29 style), and the start pose of a
// velocity-model steering problem with a "show the arcs" reveal for after you have worked it out.
import { useState, type ComponentType, type ReactNode } from 'react';
import { velocityArc, arcCentre, type Pose } from '../../../core/motion';
import { dist, type Vec2 } from '../../../core/geom2d';
import { Button } from '../../../ui/kit';
import { edgeLen, f1, pathIds, type HandScene } from './rrtHandModel';
import '../sampling.css';

/** "x" with a subscript, as SVG text (KaTeX cannot go inside an SVG). */
export function SubLabel({ x, y, sub, main = 'x', anchor = 'middle', className = 'plan-sampling-svglabel', fill }: { x: number; y: number; sub: string; main?: string; anchor?: 'start' | 'middle' | 'end'; className?: string; fill?: string }) {
  return (
    <text x={x} y={y} textAnchor={anchor} className={className} fill={fill}>
      <tspan fontStyle="italic">{main}</tspan>
      <tspan dy="0.32em" fontSize="0.74em">
        {sub}
      </tspan>
    </text>
  );
}

/** Text with a halo in the surface colour, readable on top of lines. */
export function Halo({ x, y, children, anchor = 'middle', className = 'plan-sampling-num', fill }: { x: number; y: number; children: ReactNode; anchor?: 'start' | 'middle' | 'end'; className?: string; fill?: string }) {
  return (
    <text x={x} y={y} textAnchor={anchor} className={`${className} plan-sampling-halo`} fill={fill}>
      {children}
    </text>
  );
}

export interface TreeView {
  W: number;
  H: number;
  s: number;
  X: (p: Vec2) => number;
  Y: (p: Vec2) => number;
}

/** Fit a scene (tree, x_new and its circle) into a box at most `maxW` wide, equal scale on both axes. */
export function fitView(points: readonly Vec2[], maxW = 560, pad = 26, maxScale = 40): TreeView {
  let x0 = Infinity,
    x1 = -Infinity,
    y0 = Infinity,
    y1 = -Infinity;
  for (const p of points) {
    x0 = Math.min(x0, p.x);
    x1 = Math.max(x1, p.x);
    y0 = Math.min(y0, p.y);
    y1 = Math.max(y1, p.y);
  }
  const s = Math.min(maxScale, (maxW - 2 * pad) / Math.max(1e-6, x1 - x0));
  const W = Math.round((x1 - x0) * s + 2 * pad);
  const H = Math.round((y1 - y0) * s + 2 * pad);
  return { W, H, s, X: (p) => pad + (p.x - x0) * s, Y: (p) => pad + (y1 - p.y) * s };
}

/** Where to put an edge's length label: off the midpoint, on the side away from `away`. */
export function edgeLabelPos(a: Vec2, b: Vec2, away: Vec2, off: number): Vec2 {
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const L = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const nx = -(b.y - a.y) / L;
  const ny = (b.x - a.x) / L;
  const s1 = { x: mx + nx * off, y: my + ny * off };
  const s2 = { x: mx - nx * off, y: my - ny * off };
  return Math.hypot(s1.x - away.x, s1.y - away.y) >= Math.hypot(s2.x - away.x, s2.y - away.y) ? s1 : s2;
}

/** The 2025 Q29-style figure for one instance: tree, printed edge lengths, x_new and its neighbourhood. */
export function rrtTreeFigure(scene: HandScene, opts: { descendant?: number | null } = {}): ComponentType {
  const { nodes, xnew, radius } = scene;
  const pts: Vec2[] = [...nodes.map((n) => n.p), { x: xnew.x - radius, y: xnew.y - radius }, { x: xnew.x + radius, y: xnew.y + radius }];
  const v = fitView(pts, 560, 24, 34);
  const inCircle = nodes.filter((n) => dist(n.p, xnew) <= radius + 1e-9).map((n) => n.id);
  const labelled = new Set<number>([0, ...inCircle, ...(opts.descendant != null ? [opts.descendant] : [])]);
  // Print the length of every edge on a path from x_0 to a labelled vertex (the paper prints only these).
  const printed = new Set<number>();
  for (const id of labelled) for (const k of pathIds(nodes, id)) if (k !== 0) printed.add(k);
  const awayPx = { x: v.X(xnew), y: v.Y(xnew) };
  function TreeFigure() {
    return (
      <svg
        className="figure plan-sampling-fig"
        viewBox={`0 0 ${v.W} ${v.H}`}
        width="100%"
        style={{ maxWidth: v.W }}
        role="img"
        aria-label={`Partly built tree rooted at x0 with ${nodes.length} vertices. The new sample x_new sits inside a shaded neighbourhood of radius ${f1(radius)} that contains ${inCircle
          .map((id) => `x_${nodes[id].label}`)
          .join(', ')}. Printed edge lengths: ${[...printed].map((k) => `x_${nodes[nodes[k].parent].label || '·'} to x_${nodes[k].label || '·'} ${f1(edgeLen(nodes, k))}`).join('; ')}.`}
      >
        <circle cx={v.X(xnew)} cy={v.Y(xnew)} r={radius * v.s} className="plan-sampling-hood" />
        {nodes.map((n) =>
          n.parent < 0 ? null : <line key={`e${n.id}`} x1={v.X(n.p)} y1={v.Y(n.p)} x2={v.X(nodes[n.parent].p)} y2={v.Y(nodes[n.parent].p)} className="plan-sampling-edge" />
        )}
        {[...printed].map((k) => {
          const a = { x: v.X(nodes[k].p), y: v.Y(nodes[k].p) };
          const b = { x: v.X(nodes[nodes[k].parent].p), y: v.Y(nodes[nodes[k].parent].p) };
          const q = edgeLabelPos(a, b, awayPx, 11);
          return (
            <Halo key={`l${k}`} x={q.x} y={q.y + 4} className="plan-sampling-num plan-sampling-edgenum">
              {f1(edgeLen(nodes, k))}
            </Halo>
          );
        })}
        {nodes.map((n) => (
          <circle key={`n${n.id}`} cx={v.X(n.p)} cy={v.Y(n.p)} r={n.id === 0 ? 6.5 : 5} className={n.id === 0 ? 'plan-sampling-root' : 'plan-sampling-node'} />
        ))}
        {nodes.map((n) => {
          if (!labelled.has(n.id)) return null;
          const p = { x: v.X(n.p), y: v.Y(n.p) };
          // Label above-left of the node, or below when it sits under x_new.
          const below = n.p.y < xnew.y - 0.4;
          return <SubLabel key={`t${n.id}`} x={p.x + (n.id === 0 ? 12 : -10)} y={below ? p.y + 19 : p.y - 9} sub={n.label} />;
        })}
        <line x1={v.X(xnew)} y1={v.Y(xnew)} x2={v.X(xnew) + radius * v.s * Math.cos(-0.5)} y2={v.Y(xnew) - radius * v.s * Math.sin(-0.5)} className="plan-sampling-radius" />
        <Halo x={v.X(xnew) + radius * v.s * 0.62 * Math.cos(-0.5)} y={v.Y(xnew) - radius * v.s * 0.62 * Math.sin(-0.5) + 14} className="plan-sampling-num plan-sampling-muted">
          r = {f1(radius)}
        </Halo>
        <circle cx={v.X(xnew)} cy={v.Y(xnew)} r={6} className="plan-sampling-xnew" />
        <SubLabel x={v.X(xnew)} y={v.Y(xnew) + 20} sub="new" className="plan-sampling-svglabel plan-sampling-xnewlabel" />
      </svg>
    );
  }
  return TreeFigure;
}

// ------------------------------------------------------------------ velocity-model steering

export interface SteerLeg {
  from: Pose;
  to: Pose;
  v: number;
  w: number;
  dt: number;
}

const LEG_COLOURS = ['var(--m1)', 'var(--m2)', 'var(--m3)'];

/** The start pose of a 2023 Q32-style problem, with a button that draws the arcs (the worked solution). */
export function steerFigure(start: Pose, legs: readonly SteerLeg[]): ComponentType {
  const arcs = legs.map((l) => velocityArc(l.from, l.v, l.w, l.dt, 48));
  const pts: Vec2[] = [start, ...arcs.flat()];
  // At least 4 m across, with room for labels.
  let x0 = Math.min(...pts.map((p) => p.x)) - 0.8;
  let x1 = Math.max(...pts.map((p) => p.x)) + 0.8;
  let y0 = Math.min(...pts.map((p) => p.y)) - 0.8;
  let y1 = Math.max(...pts.map((p) => p.y)) + 0.8;
  if (x1 - x0 < 4) {
    const c = (x0 + x1) / 2;
    x0 = c - 2;
    x1 = c + 2;
  }
  if (y1 - y0 < 3) {
    const c = (y0 + y1) / 2;
    y0 = c - 1.5;
    y1 = c + 1.5;
  }
  const PAD = 34;
  const s = Math.min(70, 480 / Math.max(x1 - x0, ((y1 - y0) * 480) / 300));
  const W = Math.round((x1 - x0) * s + 2 * PAD);
  const H = Math.round((y1 - y0) * s + 2 * PAD);
  const X = (x: number) => PAD + (x - x0) * s;
  const Y = (y: number) => PAD + (y1 - y) * s;
  const span = Math.max(x1 - x0, y1 - y0);
  const stepM = span > 14 ? 2 : span > 6 ? 1 : 0.5;
  const ticksX: number[] = [];
  for (let t = Math.ceil(x0 / stepM) * stepM; t <= x1 + 1e-9; t += stepM) ticksX.push(Number(t.toFixed(6)));
  const ticksY: number[] = [];
  for (let t = Math.ceil(y0 / stepM) * stepM; t <= y1 + 1e-9; t += stepM) ticksY.push(Number(t.toFixed(6)));
  const fmtP = (p: Pose) => `(${p.x.toFixed(2)}, ${p.y.toFixed(2)}), θ = ${Number(p.theta.toFixed(3))}`;
  const arrow = (p: Pose, len: number) => {
    const ax = X(p.x);
    const ay = Y(p.y);
    const bx = ax + len * Math.cos(p.theta);
    const by = ay - len * Math.sin(p.theta);
    const h = 7;
    const a = Math.atan2(by - ay, bx - ax);
    return `M${ax.toFixed(1)} ${ay.toFixed(1)}L${bx.toFixed(1)} ${by.toFixed(1)}M${(bx - h * Math.cos(a - 0.45)).toFixed(1)} ${(by - h * Math.sin(a - 0.45)).toFixed(1)}L${bx.toFixed(1)} ${by.toFixed(1)}L${(bx - h * Math.cos(a + 0.45)).toFixed(1)} ${(by - h * Math.sin(a + 0.45)).toFixed(1)}`;
  };
  function SteerFigure() {
    const [show, setShow] = useState(false);
    return (
      <div className="plan-sampling-steerfig">
        <svg
          className="figure plan-sampling-fig"
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          style={{ maxWidth: W }}
          role="img"
          aria-label={`Start pose of the robot at ${fmtP(start)} rad, heading arrow shown.${show ? ` Arcs drawn for ${legs.length} command(s), ending at ${fmtP(legs[legs.length - 1].to)}.` : ''}`}
        >
          {ticksX.map((t) => (
            <g key={`gx${t}`}>
              <line x1={X(t)} x2={X(t)} y1={PAD} y2={H - PAD} className={Math.abs(t) < 1e-9 ? 'plan-sampling-axis' : 'plan-sampling-grid'} />
              <text x={X(t)} y={H - PAD + 14} textAnchor="middle" className="tick">
                {t}
              </text>
            </g>
          ))}
          {ticksY.map((t) => (
            <g key={`gy${t}`}>
              <line y1={Y(t)} y2={Y(t)} x1={PAD} x2={W - PAD} className={Math.abs(t) < 1e-9 ? 'plan-sampling-axis' : 'plan-sampling-grid'} />
              <text x={PAD - 5} y={Y(t) + 4} textAnchor="end" className="tick">
                {t}
              </text>
            </g>
          ))}
          <text x={W - PAD} y={H - 6} textAnchor="end" className="axis-label">
            x (m)
          </text>
          <text x={8} y={PAD - 10} className="axis-label">
            y (m)
          </text>
          {show &&
            legs.map((l, i) => {
              const c = arcCentre(l.from, l.v, l.w);
              const pts = arcs[i];
              const d = pts.map((p, k) => `${k ? 'L' : 'M'}${X(p.x).toFixed(1)} ${Y(p.y).toFixed(1)}`).join('');
              const col = LEG_COLOURS[i % LEG_COLOURS.length];
              const inView = c && c.cx > x0 && c.cx < x1 && c.cy > y0 && c.cy < y1;
              return (
                <g key={`leg${i}`}>
                  {inView && c && (
                    <g className="plan-sampling-centre">
                      <line x1={X(c.cx)} y1={Y(c.cy)} x2={X(l.from.x)} y2={Y(l.from.y)} stroke={col} />
                      <line x1={X(c.cx)} y1={Y(c.cy)} x2={X(l.to.x)} y2={Y(l.to.y)} stroke={col} />
                      <path d={`M${X(c.cx) - 4} ${Y(c.cy)}h8M${X(c.cx)} ${Y(c.cy) - 4}v8`} stroke={col} />
                    </g>
                  )}
                  <path d={d} fill="none" stroke={col} strokeWidth={3} strokeLinecap="round" />
                  <path d={arrow(l.to, 26)} fill="none" stroke={col} strokeWidth={2} />
                  <circle cx={X(l.to.x)} cy={Y(l.to.y)} r={4.5} fill={col} />
                  <Halo x={X(l.to.x) + 8} y={Y(l.to.y) - 9} anchor="start" className="plan-sampling-num" fill={col}>
                    {`${i + 1}: (${l.to.x.toFixed(2)}, ${l.to.y.toFixed(2)}), θ ${Number(l.to.theta.toFixed(3))}`}
                  </Halo>
                </g>
              );
            })}
          <path d={arrow(start, 34)} fill="none" className="plan-sampling-startarrow" />
          <circle cx={X(start.x)} cy={Y(start.y)} r={6} className="plan-sampling-root" />
          <Halo x={X(start.x) + 9} y={Y(start.y) + 20} anchor="start" className="plan-sampling-num">
            {`start (${Number(start.x.toFixed(3))}, ${Number(start.y.toFixed(3))}), θ₀ = ${Number(start.theta.toFixed(3))} rad`}
          </Halo>
        </svg>
        <div className="row gap-s wrap">
          <Button size="sm" onClick={() => setShow((x) => !x)} aria-pressed={show}>
            {show ? 'Hide the arcs' : 'Show the arcs (spoiler: the worked path)'}
          </Button>
          {show && <span className="muted small">Thin lines run from each arc’s centre (+) to its ends: their length is |r| = |v/ω|.</span>}
        </div>
      </div>
    );
  }
  return SteerFigure;
}
