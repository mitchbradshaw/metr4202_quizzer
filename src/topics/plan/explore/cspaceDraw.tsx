// Drawing helpers shared by the workspace ↔ C-space simulation and the C-space labelling problems:
// one frame geometry for both plots (like the papers: workspace 10 × 10 m on the left, C-space [0, 2π]² on
// the right, ticks at multiples of π/2), shapes, the arm with its θ1/θ2 arcs, and C-space cells as SVG paths.
import { memo, type ReactNode } from 'react';
import type { CGrid } from '../../../core/cspace';
import { TAU } from '../../../core/cspace';
import type { Shape, Vec2 } from '../../../core/geom2d';
import '../cspace.css';

/** Frame geometry in SVG units: plot area x ∈ [L, L + S], y ∈ [T, T + S]. */
export const FR = { L: 40, T: 8, S: 312, W: 360, H: 354 } as const;

export const wsX = (x: number) => FR.L + (x / 10) * FR.S;
export const wsY = (y: number) => FR.T + (1 - y / 10) * FR.S;
export const wsFromPx = (px: number, py: number): Vec2 => ({ x: ((px - FR.L) / FR.S) * 10, y: (1 - (py - FR.T) / FR.S) * 10 });
export const wsLen = (m: number) => (m / 10) * FR.S;
export const csX = (t1: number) => FR.L + (t1 / TAU) * FR.S;
export const csY = (t2: number) => FR.T + (1 - t2 / TAU) * FR.S;
/** C-space angles (not wrapped) from SVG coordinates. */
export const csFromPx = (px: number, py: number): [number, number] => [((px - FR.L) / FR.S) * TAU, (1 - (py - FR.T) / FR.S) * TAU];

const PI_TICKS: [number, string][] = [
  [0, '0'],
  [Math.PI / 2, 'π/2'],
  [Math.PI, 'π'],
  [(3 * Math.PI) / 2, '3π/2'],
  [TAU, '2π'],
];

/** Workspace frame: 1 m grid, ticks every 2 m, axis names (x, y in metres). */
export const WsFrame = memo(function WsFrame() {
  const lines: ReactNode[] = [];
  for (let v = 0; v <= 10; v++) {
    const cls = v % 2 ? 'plan-cspace-grid-minor' : 'plan-cspace-grid';
    lines.push(<line key={`x${v}`} className={cls} x1={wsX(v)} x2={wsX(v)} y1={FR.T} y2={FR.T + FR.S} />);
    lines.push(<line key={`y${v}`} className={cls} y1={wsY(v)} y2={wsY(v)} x1={FR.L} x2={FR.L + FR.S} />);
  }
  return (
    <g aria-hidden="true">
      <rect className="plan-cspace-plotbg" x={FR.L} y={FR.T} width={FR.S} height={FR.S} />
      {lines}
      <rect className="plan-cspace-frame" x={FR.L} y={FR.T} width={FR.S} height={FR.S} />
      {[0, 2, 4, 6, 8, 10].map((v) => (
        <g key={v}>
          <text className="plan-cspace-tick" x={wsX(v)} y={FR.T + FR.S + 14} textAnchor="middle">
            {v}
          </text>
          <text className="plan-cspace-tick" x={FR.L - 5} y={wsY(v) + 3.5} textAnchor="end">
            {v}
          </text>
        </g>
      ))}
      <text className="plan-cspace-axis" x={wsX(5)} y={FR.T + FR.S + 29} textAnchor="middle">
        x (m)
      </text>
      <text className="plan-cspace-axis" transform={`translate(11 ${wsY(5)}) rotate(-90)`} textAnchor="middle">
        y (m)
      </text>
    </g>
  );
});

/** C-space frame: θ1 horizontal, θ2 vertical, both [0, 2π], grid at π/4, labels at π/2. */
export const CsFrame = memo(function CsFrame({ bg = true }: { bg?: boolean }) {
  const lines: ReactNode[] = [];
  for (let q = 0; q <= 8; q++) {
    const a = (q * Math.PI) / 4;
    const cls = q % 2 ? 'plan-cspace-grid-minor' : 'plan-cspace-grid';
    lines.push(<line key={`x${q}`} className={cls} x1={csX(a)} x2={csX(a)} y1={FR.T} y2={FR.T + FR.S} />);
    lines.push(<line key={`y${q}`} className={cls} y1={csY(a)} y2={csY(a)} x1={FR.L} x2={FR.L + FR.S} />);
  }
  return (
    <g aria-hidden="true">
      {bg && <rect className="plan-cspace-plotbg" x={FR.L} y={FR.T} width={FR.S} height={FR.S} />}
      {lines}
      {PI_TICKS.map(([a, s]) => (
        <g key={s}>
          <text className="plan-cspace-tick" x={csX(a)} y={FR.T + FR.S + 14} textAnchor="middle">
            {s}
          </text>
          <text className="plan-cspace-tick" x={FR.L - 5} y={csY(a) + 3.5} textAnchor="end">
            {s}
          </text>
        </g>
      ))}
      <text className="plan-cspace-axis" x={csX(1.25 * Math.PI)} y={FR.T + FR.S + 29} textAnchor="middle">
        θ₁ (rad)
      </text>
      <text className="plan-cspace-axis" transform={`translate(11 ${csY(1.25 * Math.PI)}) rotate(-90)`} textAnchor="middle">
        θ₂ (rad)
      </text>
    </g>
  );
});

/** Grid-line overlay for the C-space (drawn above a canvas). */
export const CsGridOverlay = memo(function CsGridOverlay() {
  const lines: ReactNode[] = [];
  for (let q = 1; q < 8; q++) {
    const a = (q * Math.PI) / 4;
    const cls = q % 2 ? 'plan-cspace-grid-minor' : 'plan-cspace-grid';
    lines.push(<line key={`x${q}`} className={cls} x1={csX(a)} x2={csX(a)} y1={FR.T} y2={FR.T + FR.S} />);
    lines.push(<line key={`y${q}`} className={cls} y1={csY(a)} y2={csY(a)} x1={FR.L} x2={FR.L + FR.S} />);
  }
  return (
    <g aria-hidden="true" pointerEvents="none">
      {lines}
      <rect className="plan-cspace-frame" x={FR.L} y={FR.T} width={FR.S} height={FR.S} />
    </g>
  );
});

/** SVG path data of a polygon/rectangle in workspace pixels (circles: use <circle>). */
export function shapeD(s: Shape): string {
  if (s.kind === 'rect') return `M${wsX(s.x)} ${wsY(s.y)}H${wsX(s.x + s.w)}V${wsY(s.y + s.h)}H${wsX(s.x)}Z`;
  if (s.kind === 'circle') {
    const r = wsLen(s.r);
    const cx = wsX(s.x);
    const cy = wsY(s.y);
    return `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`;
  }
  return `M${s.pts.map((p) => `${wsX(p.x).toFixed(2)} ${wsY(p.y).toFixed(2)}`).join('L')}Z`;
}

/** Arc of radius r (metres) about c from world angle a0 to a1 (anticlockwise if a1 > a0), in workspace pixels. */
export function wsArcD(c: Vec2, r: number, a0: number, a1: number): string {
  const R = wsLen(r);
  const p = (a: number) => `${(wsX(c.x) + R * Math.cos(a)).toFixed(2)} ${(wsY(c.y) - R * Math.sin(a)).toFixed(2)}`;
  const span = a1 - a0;
  if (Math.abs(span) < 1e-6) return '';
  if (Math.abs(span) >= TAU - 1e-6) return `M${p(a0)}A${R} ${R} 0 1 0 ${p(a0 + Math.PI)}A${R} ${R} 0 1 0 ${p(a0)}`;
  return `M${p(a0)}A${R} ${R} 0 ${Math.abs(span) > Math.PI ? 1 : 0} ${span > 0 ? 0 : 1} ${p(a1)}`;
}

/** SVG path of every C-space cell for which `on(k)` holds (row runs as rectangles). */
export function cellsPathD(g: CGrid, on: (k: number) => boolean): string {
  const n = g.n;
  const d = FR.S / n;
  let out = '';
  for (let j = 0; j < n; j++) {
    const y = FR.T + FR.S - (j + 1) * d;
    let i = 0;
    while (i < n) {
      if (!on(j * n + i)) {
        i++;
        continue;
      }
      const s = i;
      while (i < n && on(j * n + i)) i++;
      out += `M${(FR.L + s * d).toFixed(2)} ${y.toFixed(2)}h${((i - s) * d).toFixed(2)}v${d.toFixed(2)}h${(-(i - s) * d).toFixed(2)}z`;
    }
  }
  return out;
}

/** Split a C-space polyline wherever it wraps (a jump of more than π in either joint). */
export function cspacePolylines(pts: readonly (readonly [number, number])[]): string {
  let d = '';
  let prev: readonly [number, number] | null = null;
  for (const p of pts) {
    const x = csX(((p[0] % TAU) + TAU) % TAU);
    const y = csY(((p[1] % TAU) + TAU) % TAU);
    const jump = !prev || Math.abs(((prev[0] % TAU) + TAU) % TAU - (((p[0] % TAU) + TAU) % TAU)) > Math.PI || Math.abs(((prev[1] % TAU) + TAU) % TAU - (((p[1] % TAU) + TAU) % TAU)) > Math.PI;
    d += `${jump ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
    prev = p;
  }
  return d;
}

export interface ArmPose {
  base: Vec2;
  l1: number;
  l2: number;
  t1: number;
  t2: number;
}

export function armPoints(a: ArmPose) {
  const elbow = { x: a.base.x + a.l1 * Math.cos(a.t1), y: a.base.y + a.l1 * Math.sin(a.t1) };
  const tip = { x: elbow.x + a.l2 * Math.cos(a.t1 + a.t2), y: elbow.y + a.l2 * Math.sin(a.t1 + a.t2) };
  return { elbow, tip };
}

/** Short signed angle of θ2 for drawing its arc (the bend the eye sees), in (−π, π]. */
const shortAngle = (a: number) => {
  const w = ((a % TAU) + TAU) % TAU;
  return w > Math.PI ? w - TAU : w;
};

/**
 * The arm as the papers draw it: thick links, the θ1 arc from +x at the base and the θ2 arc from the
 * extension of link 1 at the elbow. Colours are CSS values; `labels` draws θ₁ / θ₂ next to the arcs.
 */
export function ArmView({
  pose,
  c1 = 'var(--text)',
  c2 = 'var(--text-2)',
  w1 = 6,
  w2 = 4.5,
  arcs = true,
  labels = true,
  opacity,
  className,
}: {
  pose: ArmPose;
  c1?: string;
  c2?: string;
  w1?: number;
  w2?: number;
  arcs?: boolean;
  labels?: boolean;
  opacity?: number;
  className?: string;
}) {
  const { elbow, tip } = armPoints(pose);
  const b = pose.base;
  const t2s = shortAngle(pose.t2);
  const ext = { x: elbow.x + 0.9 * Math.cos(pose.t1), y: elbow.y + 0.9 * Math.sin(pose.t1) };
  const r1 = 0.55;
  const r2 = 0.62;
  const m1 = pose.t1 / 2;
  const m2 = pose.t1 + t2s / 2;
  return (
    <g opacity={opacity} className={className} pointerEvents="none">
      {arcs && (
        <g className="plan-cspace-arcs">
          <line x1={wsX(b.x)} y1={wsY(b.y)} x2={wsX(b.x + 0.85)} y2={wsY(b.y)} />
          <path d={wsArcD(b, r1, 0, ((pose.t1 % TAU) + TAU) % TAU)} />
          <line x1={wsX(elbow.x)} y1={wsY(elbow.y)} x2={wsX(ext.x)} y2={wsY(ext.y)} strokeDasharray="3 3" />
          {Math.abs(t2s) > 0.02 && <path d={wsArcD(elbow, r2, pose.t1, pose.t1 + t2s)} />}
        </g>
      )}
      <line x1={wsX(b.x)} y1={wsY(b.y)} x2={wsX(elbow.x)} y2={wsY(elbow.y)} stroke={c1} strokeWidth={w1} strokeLinecap="round" />
      <line x1={wsX(elbow.x)} y1={wsY(elbow.y)} x2={wsX(tip.x)} y2={wsY(tip.y)} stroke={c2} strokeWidth={w2} strokeLinecap="round" />
      <circle cx={wsX(b.x)} cy={wsY(b.y)} r={4} className="plan-cspace-joint" />
      <circle cx={wsX(elbow.x)} cy={wsY(elbow.y)} r={3.2} className="plan-cspace-joint" />
      {arcs && labels && (
        <g className="plan-cspace-arclabel">
          <text x={wsX(b.x + (r1 + 0.42) * Math.cos(m1))} y={wsY(b.y + (r1 + 0.42) * Math.sin(m1)) + 4} textAnchor="middle">
            θ₁
          </text>
          {Math.abs(t2s) > 0.12 && (
            <text x={wsX(elbow.x + (r2 + 0.42) * Math.cos(m2))} y={wsY(elbow.y + (r2 + 0.42) * Math.sin(m2)) + 4} textAnchor="middle">
              θ₂
            </text>
          )}
        </g>
      )}
    </g>
  );
}

/** Obstacle shape filled in `fill`, with its letter at the centre. */
export function ObstacleView({ s, label, fill, stroke, labelPos, className }: { s: Shape; label?: string; fill: string; stroke?: string; labelPos: Vec2; className?: string }) {
  return (
    <g className={className}>
      {s.kind === 'circle' ? (
        <circle cx={wsX(s.x)} cy={wsY(s.y)} r={wsLen(s.r)} fill={fill} stroke={stroke} strokeWidth={stroke ? 2 : 0} />
      ) : (
        <path d={shapeD(s)} fill={fill} stroke={stroke} strokeWidth={stroke ? 2 : 0} strokeLinejoin="round" />
      )}
      {label && (
        <text className="plan-cspace-olabel" x={wsX(labelPos.x)} y={wsY(labelPos.y) + 5} textAnchor="middle">
          {label}
        </text>
      )}
    </g>
  );
}

/** A point inside the shape for its label (centroid, nudged inside for odd shapes). */
export function labelPoint(s: Shape): Vec2 {
  if (s.kind === 'circle') return { x: s.x, y: s.y };
  if (s.kind === 'rect') return { x: s.x + s.w / 2, y: s.y + s.h / 2 };
  const n = s.pts.length;
  return { x: s.pts.reduce((t, p) => t + p.x, 0) / n, y: s.pts.reduce((t, p) => t + p.y, 0) / n };
}
