// Reusable SVG pieces for mechanical diagrams and animations (springs, dampers, ground, masses).
// All take pixel coordinates inside an <svg>. For animation, compute the path strings in a
// useRaf callback and set them on refs (see springPath) instead of re-rendering React.
import type { ReactNode } from 'react';

/** Zigzag spring path from (x1,y1) to (x2,y2) with `coils` zigzags of half-width `amp`. */
export function springPath(x1: number, y1: number, x2: number, y2: number, coils = 6, amp = 7, lead = 8): string {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const L = Math.hypot(dx, dy) || 1;
  const ux = dx / L;
  const uy = dy / L;
  const nx = -uy;
  const ny = ux;
  const ld = Math.min(lead, L / 4);
  const body = L - 2 * ld;
  const n = coils * 2;
  let d = `M${x1.toFixed(1)} ${y1.toFixed(1)}L${(x1 + ux * ld).toFixed(1)} ${(y1 + uy * ld).toFixed(1)}`;
  for (let i = 1; i <= n; i++) {
    const s = ld + (body * (i - 0.5)) / n;
    const side = i % 2 ? 1 : -1;
    d += `L${(x1 + ux * s + nx * amp * side).toFixed(1)} ${(y1 + uy * s + ny * amp * side).toFixed(1)}`;
  }
  d += `L${(x2 - ux * ld).toFixed(1)} ${(y2 - uy * ld).toFixed(1)}L${x2.toFixed(1)} ${y2.toFixed(1)}`;
  return d;
}

/** Dashpot geometry as two paths: the cylinder (attached at x1,y1) and the piston rod (attached at x2,y2). */
export function damperPaths(x1: number, y1: number, x2: number, y2: number, w = 9): { cyl: string; rod: string } {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const L = Math.hypot(dx, dy) || 1;
  const ux = dx / L;
  const uy = dy / L;
  const nx = -uy;
  const ny = ux;
  const cylStart = L * 0.25;
  const cylLen = Math.max(14, L * 0.45);
  const p = (s: number, o = 0) => `${(x1 + ux * s + nx * o).toFixed(1)} ${(y1 + uy * s + ny * o).toFixed(1)}`;
  const cyl = `M${p(0)}L${p(cylStart)}M${p(cylStart, -w)}L${p(cylStart, w)}M${p(cylStart, -w)}L${p(cylStart + cylLen, -w)}M${p(cylStart, w)}L${p(cylStart + cylLen, w)}`;
  const pistonAt = Math.min(L - 6, cylStart + cylLen * 0.6);
  const q = (s: number, o = 0) => `${(x1 + ux * s + nx * o).toFixed(1)} ${(y1 + uy * s + ny * o).toFixed(1)}`;
  const rod = `M${q(pistonAt, -w + 2)}L${q(pistonAt, w - 2)}M${q(pistonAt)}L${x2.toFixed(1)} ${y2.toFixed(1)}`;
  return { cyl, rod };
}

export function Spring({ x1, y1, x2, y2, coils = 6, amp = 7, color = 'var(--text-2)', width = 1.8 }: { x1: number; y1: number; x2: number; y2: number; coils?: number; amp?: number; color?: string; width?: number }) {
  return <path d={springPath(x1, y1, x2, y2, coils, amp)} fill="none" stroke={color} strokeWidth={width} strokeLinejoin="round" />;
}

export function Damper({ x1, y1, x2, y2, color = 'var(--text-2)', width = 1.8 }: { x1: number; y1: number; x2: number; y2: number; color?: string; width?: number }) {
  const { cyl, rod } = damperPaths(x1, y1, x2, y2);
  return (
    <g fill="none" stroke={color} strokeWidth={width}>
      <path d={cyl} />
      <path d={rod} />
    </g>
  );
}

/** Hatched ground: a line of length w centred at (x, y); hatch on the side given by `side`. */
export function Ground({ x, y, w = 80, side = 'below', vertical = false }: { x: number; y: number; w?: number; side?: 'below' | 'above' | 'left' | 'right'; vertical?: boolean }) {
  const hatches: ReactNode[] = [];
  const n = Math.max(4, Math.round(w / 9));
  for (let i = 0; i <= n; i++) {
    const t = -w / 2 + (w * i) / n;
    if (!vertical) {
      const dy = side === 'above' ? -8 : 8;
      hatches.push(<line key={i} x1={x + t} y1={y} x2={x + t - 6} y2={y + dy} />);
    } else {
      const dx = side === 'left' ? -8 : 8;
      hatches.push(<line key={i} x1={x} y1={y + t} x2={x + dx} y2={y + t + 6} />);
    }
  }
  return (
    <g stroke="var(--text-3)" strokeWidth={1.2}>
      {vertical ? <line x1={x} y1={y - w / 2} x2={x} y2={y + w / 2} strokeWidth={2} /> : <line x1={x - w / 2} y1={y} x2={x + w / 2} y2={y} strokeWidth={2} />}
      {hatches}
    </g>
  );
}

export function MassBlock({ x, y, w, h, label, color = 'var(--surface-2)', stroke = 'var(--text-2)' }: { x: number; y: number; w: number; h: number; label?: ReactNode; color?: string; stroke?: string }) {
  return (
    <g>
      <rect x={x - w / 2} y={y - h / 2} width={w} height={h} rx={4} fill={color} stroke={stroke} strokeWidth={1.8} />
      {label && (
        <text x={x} y={y + 5} textAnchor="middle" className="diagram-label">
          {label}
        </text>
      )}
    </g>
  );
}

export function Arrow({ x1, y1, x2, y2, color = 'var(--text-2)', width = 1.6, label, head = 7 }: { x1: number; y1: number; x2: number; y2: number; color?: string; width?: number; label?: ReactNode; head?: number }) {
  const a = Math.atan2(y2 - y1, x2 - x1);
  const hx1 = x2 - head * Math.cos(a - 0.4);
  const hy1 = y2 - head * Math.sin(a - 0.4);
  const hx2 = x2 - head * Math.cos(a + 0.4);
  const hy2 = y2 - head * Math.sin(a + 0.4);
  return (
    <g stroke={color} strokeWidth={width} fill={color}>
      <line x1={x1} y1={y1} x2={x2} y2={y2} />
      <path d={`M${x2} ${y2}L${hx1} ${hy1}L${hx2} ${hy2}Z`} stroke="none" />
      {label && (
        <text x={x2 + 6} y={y2 + 4} className="diagram-label" stroke="none" fill={color}>
          {label}
        </text>
      )}
    </g>
  );
}

/** Pointer position in an SVG's viewBox coordinates (for dragging things in scalable SVGs). */
export function svgPoint(svg: SVGSVGElement, clientX: number, clientY: number): { x: number; y: number } {
  const m = svg.getScreenCTM();
  if (!m) return { x: 0, y: 0 };
  const p = new DOMPoint(clientX, clientY).matrixTransform(m.inverse());
  return { x: p.x, y: p.y };
}

/** A simple SVG frame for static problem figures. */
export function Figure({ width = 360, height = 200, children, label }: { width?: number; height?: number; children: ReactNode; label: string }) {
  return (
    <svg className="figure" viewBox={`0 0 ${width} ${height}`} width="100%" style={{ maxWidth: width }} role="img" aria-label={label}>
      {children}
    </svg>
  );
}
