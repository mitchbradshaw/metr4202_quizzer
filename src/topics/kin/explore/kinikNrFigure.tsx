// Figure for the kin-nr-step generator: a planar 2-link arm at its initial guess θ⁽⁰⁾ (link lengths, joint angles
// with their arcs, θ2 measured from the extension of link 1) and the target x_d, drawn to scale from the instance.
import type { ComponentType } from 'react';
import { planarFk } from '../../../core/kin';
import '../kinik.css';

const W = 440;
const H = 300;
const PAD = 34;

export interface NrFigureSpec {
  L: readonly [number, number];
  th: readonly [number, number];
  xd: readonly [number, number];
  /** Text of the two joint-angle labels, e.g. ['θ₁ = 0.45 rad', 'θ₂ = 1.2 rad']. */
  labels: readonly [string, string];
  /** Text next to the target, e.g. 'x_d = (0.85, 0.92) m'. */
  target: string;
}

/** Arc of radius r (px) around (cx, cy) from screen angle a0 to a1 (radians, anticlockwise on paper). */
function arc(cx: number, cy: number, r: number, a0: number, a1: number): string {
  const n = Math.max(4, Math.ceil(Math.abs(a1 - a0) / 0.12));
  let d = '';
  for (let k = 0; k <= n; k++) {
    const a = a0 + ((a1 - a0) * k) / n;
    d += `${k ? 'L' : 'M'}${(cx + r * Math.cos(a)).toFixed(1)} ${(cy - r * Math.sin(a)).toFixed(1)}`;
  }
  return d;
}

export function nrFigure(spec: NrFigureSpec): ComponentType {
  const pts = planarFk(spec.L, spec.th);
  const xs = [0, ...pts.map((p) => p[0]), spec.xd[0]];
  const ys = [0, ...pts.map((p) => p[1]), spec.xd[1]];
  const x0 = Math.min(...xs) - 0.15;
  const x1 = Math.max(...xs) + 0.15;
  const y0 = Math.min(...ys) - 0.12;
  const y1 = Math.max(...ys) + 0.12;
  const S = Math.min((W - 2 * PAD) / (x1 - x0), (H - 2 * PAD) / (y1 - y0));
  const ox = W / 2 - (S * (x0 + x1)) / 2;
  const oy = H / 2 + (S * (y0 + y1)) / 2;
  const X = (x: number) => ox + S * x;
  const Y = (y: number) => oy - S * y;
  const [b, e, t] = pts;
  const a1 = spec.th[0];
  const a12 = spec.th[0] + spec.th[1];
  const r1 = Math.min(42, 0.32 * spec.L[0] * S);
  const r2 = Math.min(34, 0.3 * spec.L[1] * S);
  const ext: [number, number] = [e[0] + 0.45 * spec.L[1] * Math.cos(a1), e[1] + 0.45 * spec.L[1] * Math.sin(a1)];
  // angle labels just outside the middle of each arc, anchored away from the joint
  const lab = (a: number, r: number, cx: number, cy: number) => ({ x: cx + (r + 9) * Math.cos(a), y: cy - (r + 9) * Math.sin(a) + 4, anchor: Math.cos(a) >= -0.2 ? 'start' : 'end' });
  const l1 = lab(a1 / 2, r1, X(0), Y(0));
  const l2 = lab(a1 + spec.th[1] / 2, r2, X(e[0]), Y(e[1]));
  // link labels beside the midpoints, on the side away from the angle arcs
  const mid1 = [(X(b[0]) + X(e[0])) / 2, (Y(b[1]) + Y(e[1])) / 2];
  const mid2 = [(X(e[0]) + X(t[0])) / 2, (Y(e[1]) + Y(t[1])) / 2];
  const n1 = [-Math.sin(a1), -Math.cos(a1)];
  const n2 = [-Math.sin(a12) * Math.sign(spec.th[1] || 1), -Math.cos(a12) * Math.sign(spec.th[1] || 1)];
  const tx = X(spec.xd[0]);
  const ty = Y(spec.xd[1]);
  // put the target's label on the side facing away from the tip (and the rest of the arm)
  const away = [tx - X(t[0]), ty - Y(t[1])];
  const an = Math.hypot(away[0], away[1]) || 1;
  const tl = { x: tx + (16 * away[0]) / an, y: ty + (16 * away[1]) / an + 4, anchor: away[0] >= 0 ? 'start' : 'end' };
  const axisY = Math.max(PAD / 2, Math.min(H - PAD / 2, Y(0)));
  const axisX = Math.max(PAD / 2, Math.min(W - PAD / 2, X(0)));
  function NrFigure() {
    return (
      <div className="kin-ik-onefig">
        <svg className="kin-ik-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Two-link arm at the initial guess: ${spec.labels.join(', ')}; target ${spec.target.replace('x_d', 'x d')} at (${spec.xd.join(', ')}) m.`}>
          <defs>
            <marker id="kin-ik-nr-arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0 0L10 5L0 10Z" fill="var(--text-3)" />
            </marker>
          </defs>
          <line className="kin-ik-axis" x1={8} x2={W - 8} y1={axisY} y2={axisY} markerEnd="url(#kin-ik-nr-arr)" />
          <line className="kin-ik-axis" x1={axisX} x2={axisX} y1={H - 8} y2={8} markerEnd="url(#kin-ik-nr-arr)" />
          <text className="kin-ik-label" x={W - 12} y={axisY - 6} textAnchor="end">
            x
          </text>
          <text className="kin-ik-label" x={axisX + 7} y={16}>
            y
          </text>
          {/* extension of link 1 (θ2 is measured from it) */}
          <line x1={X(e[0])} y1={Y(e[1])} x2={X(ext[0])} y2={Y(ext[1])} stroke="var(--text-3)" strokeWidth={1.2} strokeDasharray="4 3" />
          <path d={arc(X(0), Y(0), r1, 0, a1)} fill="none" stroke="var(--m1)" strokeWidth={1.6} />
          <path d={arc(X(e[0]), Y(e[1]), r2, a1, a12)} fill="none" stroke="var(--m2)" strokeWidth={1.6} />
          <text className="kin-ik-note" x={l1.x} y={l1.y} textAnchor={l1.anchor} style={{ fill: 'var(--m1)', fontWeight: 700 }}>
            {spec.labels[0]}
          </text>
          <text className="kin-ik-note" x={l2.x} y={l2.y} textAnchor={l2.anchor} style={{ fill: 'var(--m2)', fontWeight: 700 }}>
            {spec.labels[1]}
          </text>
          <path d={`M${X(b[0])} ${Y(b[1])}L${X(e[0])} ${Y(e[1])}L${X(t[0])} ${Y(t[1])}`} fill="none" stroke="var(--text)" strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" />
          <circle className="kin-ik-joint" cx={X(b[0])} cy={Y(b[1])} r={5} />
          <circle className="kin-ik-joint" cx={X(e[0])} cy={Y(e[1])} r={5} />
          <circle cx={X(t[0])} cy={Y(t[1])} r={3.5} fill="var(--text)" />
          <text className="kin-ik-note" x={mid1[0] + 16 * n1[0]} y={mid1[1] + 16 * n1[1] + 4} textAnchor="middle" style={{ fontStyle: 'italic' }}>
            L₁ = {spec.L[0]} m
          </text>
          <text className="kin-ik-note" x={mid2[0] + 16 * n2[0]} y={mid2[1] + 16 * n2[1] + 4} textAnchor="middle" style={{ fontStyle: 'italic' }}>
            L₂ = {spec.L[1]} m
          </text>
          <line x1={X(t[0])} y1={Y(t[1])} x2={tx} y2={ty} stroke="var(--m3)" strokeWidth={1.4} strokeDasharray="5 4" />
          <circle cx={tx} cy={ty} r={8} fill="none" stroke="var(--accent)" strokeWidth={2.2} />
          <path d={`M${tx - 12} ${ty}H${tx + 12}M${tx} ${ty - 12}V${ty + 12}`} stroke="var(--accent)" strokeWidth={1.5} />
          <text className="kin-ik-note" x={tl.x} y={tl.y} textAnchor={tl.anchor} style={{ fill: 'var(--accent)', fontWeight: 700, fontStyle: 'italic' }}>
            {spec.target.startsWith('x_d') ? (
              <>
                x
                <tspan baselineShift="sub" style={{ fontSize: 9 }}>
                  d
                </tspan>
                {spec.target.slice(3)}
              </>
            ) : (
              spec.target
            )}
          </text>
          <path d={`M${X(0) - 10} ${Y(0) + 12}L${X(0)} ${Y(0)}L${X(0) + 10} ${Y(0) + 12}Z`} fill="var(--surface-3)" stroke="var(--text)" strokeWidth={1.4} />
        </svg>
      </div>
    );
  }
  return NrFigure;
}
