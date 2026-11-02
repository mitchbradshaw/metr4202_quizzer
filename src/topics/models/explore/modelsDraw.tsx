// Shared drawing pieces for the motion and sensor model simulations: a world frame (metres -> SVG px, y up),
// a metric grid, a differential-drive robot glyph, arcs from the velocity model, and a canvas layer under the
// SVG for dense point clouds and heat maps (drawn in the SVG's viewBox units).
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { velocityMotion, type Pose } from '../../../core/motion';
import '../models.css';

// ------------------------------------------------------------------ world frame

/** A world window: lower-left corner (x0, y0) and size w × h in metres. */
export interface View {
  x0: number;
  y0: number;
  w: number;
  h: number;
}

export interface Frame {
  W: number;
  H: number;
  /** Pixels per metre. */
  k: number;
  sx: (x: number) => number;
  sy: (y: number) => number;
  toWorld: (px: number, py: number) => { x: number; y: number };
  /** The world rectangle the whole SVG shows (wider or taller than the view to keep the aspect). */
  vis: View;
}

/** Fit a world window into a W × H px box with equal scales on both axes (y up). */
export function makeFrame(view: View, W: number, H: number): Frame {
  const k = Math.min(W / view.w, H / view.h);
  const ox = (W - view.w * k) / 2 - view.x0 * k;
  const oy = (H - view.h * k) / 2 + (view.y0 + view.h) * k;
  const toWorld = (px: number, py: number) => ({ x: (px - ox) / k, y: (oy - py) / k });
  const tl = toWorld(0, 0);
  const br = toWorld(W, H);
  return { W, H, k, sx: (x) => ox + x * k, sy: (y) => oy - y * k, toWorld, vis: { x0: tl.x, y0: br.y, w: br.x - tl.x, h: tl.y - br.y } };
}

/** A tidy grid spacing giving about `target` lines over `span` metres. */
export function niceStep(span: number, target = 8): number {
  const raw = span / target;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= raw) return m * p;
  return 10 * p;
}

/** A view round some points with a margin, at least `min` metres across, with the given aspect (w/h). */
export function fitView(pts: { x: number; y: number }[], aspect: number, margin = 0.6, min = 2): View {
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const p of pts) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
    x0 = Math.min(x0, p.x);
    x1 = Math.max(x1, p.x);
    y0 = Math.min(y0, p.y);
    y1 = Math.max(y1, p.y);
  }
  if (!Number.isFinite(x0)) return { x0: -1, y0: -1, w: min * aspect, h: min };
  x0 -= margin;
  x1 += margin;
  y0 -= margin;
  y1 += margin;
  let w = Math.max(min, x1 - x0);
  let h = Math.max(min / aspect, y1 - y0);
  if (w / h > aspect) h = w / aspect;
  else w = h * aspect;
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  return { x0: cx - w / 2, y0: cy - h / 2, w, h };
}

/** Metric grid over the visible window with tick labels in metres along the bottom and left edges. */
export function WorldGrid({ f, step, unit = 'm' }: { f: Frame; step?: number; unit?: string }) {
  const s = step ?? niceStep(f.vis.w, 9);
  const lines: ReactNode[] = [];
  const labels: ReactNode[] = [];
  const xs = Math.ceil(f.vis.x0 / s);
  const xe = Math.floor((f.vis.x0 + f.vis.w) / s);
  const ys = Math.ceil(f.vis.y0 / s);
  const ye = Math.floor((f.vis.y0 + f.vis.h) / s);
  const lab = (v: number) => String(Number(v.toFixed(3))).replace('-', '−');
  for (let i = xs; i <= xe; i++) {
    const x = i * s;
    const px = f.sx(x);
    lines.push(<line key={`x${i}`} className={`models-gridline ${i % 2 === 0 ? 'is-major' : ''}`} x1={px} x2={px} y1={0} y2={f.H} />);
    if (i % 2 === 0 && px > 24 && px < f.W - 14)
      labels.push(
        <text key={`xl${i}`} className="models-tick" x={px} y={f.H - 5} textAnchor="middle">
          {lab(x)}
        </text>
      );
  }
  for (let j = ys; j <= ye; j++) {
    const y = j * s;
    const py = f.sy(y);
    lines.push(<line key={`y${j}`} className={`models-gridline ${j % 2 === 0 ? 'is-major' : ''}`} x1={0} x2={f.W} y1={py} y2={py} />);
    if (j % 2 === 0 && py > 12 && py < f.H - 20)
      labels.push(
        <text key={`yl${j}`} className="models-tick" x={5} y={py + 3.5}>
          {lab(y)}
        </text>
      );
  }
  const ax = f.sx(0);
  const ay = f.sy(0);
  return (
    <g pointerEvents="none">
      {lines}
      {ax > 0 && ax < f.W && <line className="models-axisline" x1={ax} x2={ax} y1={0} y2={f.H} />}
      {ay > 0 && ay < f.H && <line className="models-axisline" x1={0} x2={f.W} y1={ay} y2={ay} />}
      {labels}
      <text className="models-tick" x={f.W - 6} y={f.H - 18} textAnchor="end">
        x ({unit}) →
      </text>
      <text className="models-tick" x={6} y={14}>
        ↑ y ({unit})
      </text>
    </g>
  );
}

// ------------------------------------------------------------------ robot glyph and arrows

/** Arrowhead path (filled) at (x2, y2) pointing away from (x1, y1), in px. */
export function headD(x1: number, y1: number, x2: number, y2: number, size = 7): string {
  const a = Math.atan2(y2 - y1, x2 - x1);
  const p = (da: number) => `${(x2 - size * Math.cos(a + da)).toFixed(1)} ${(y2 - size * Math.sin(a + da)).toFixed(1)}`;
  return `M${x2.toFixed(1)} ${y2.toFixed(1)}L${p(0.42)}L${p(-0.42)}Z`;
}

/**
 * A differential-drive robot seen from above: body circle, two wheels across the heading and a nose line.
 * `r` is the body radius in metres (never drawn smaller than `minPx`).
 */
export function RobotGlyph({
  pose,
  f,
  r = 0.18,
  color = 'var(--text)',
  fill = 'var(--surface)',
  dashed,
  opacity,
  minPx = 9,
  label,
  labelDy = -14,
  labelBelow,
}: {
  pose: Pose;
  f: Frame;
  r?: number;
  color?: string;
  fill?: string;
  dashed?: boolean;
  opacity?: number;
  minPx?: number;
  label?: ReactNode;
  labelDy?: number;
  /** Put the label under the glyph (ghosts, so they do not cover the real labels). */
  labelBelow?: boolean;
}) {
  const R = Math.max(minPx, r * f.k);
  const cx = f.sx(pose.x);
  const cy = f.sy(pose.y);
  const c = Math.cos(pose.theta);
  const s = -Math.sin(pose.theta); // screen y is down
  const wheel = (side: 1 | -1) => {
    const wx = cx - s * side * R * 0.95;
    const wy = cy + c * side * R * 0.95;
    const L = R * 0.55;
    return <line x1={wx - c * L} y1={wy - s * L} x2={wx + c * L} y2={wy + s * L} stroke={color} strokeWidth={Math.max(3, R * 0.28)} strokeLinecap="round" />;
  };
  return (
    <g opacity={opacity} pointerEvents="none">
      {wheel(1)}
      {wheel(-1)}
      <circle cx={cx} cy={cy} r={R} fill={fill} stroke={color} strokeWidth={2} strokeDasharray={dashed ? '4 3' : undefined} />
      <line x1={cx} y1={cy} x2={cx + c * R * 1.55} y2={cy + s * R * 1.55} stroke={color} strokeWidth={2.4} strokeLinecap="round" />
      <path d={headD(cx, cy, cx + c * R * 1.75, cy + s * R * 1.75, 7)} fill={color} />
      {label && (
        <text className="models-note is-strong" x={cx} y={labelBelow ? cy + R + 16 : cy + labelDy - R * 0.6} textAnchor="middle" fill={color}>
          {label}
        </text>
      )}
    </g>
  );
}

// ------------------------------------------------------------------ velocity-model arcs

/** SVG path of the velocity-model arc from `p` under (v, ω) for Δt (exact: sampled finely along the circle). */
export function arcPathD(p: Pose, v: number, w: number, dt: number, f: Frame): string {
  const turn = Math.abs(w * dt);
  const n = Math.max(2, Math.min(240, Math.ceil(turn / 0.03) + 2));
  let d = '';
  for (let i = 0; i <= n; i++) {
    const q = velocityMotion(p, v, w, (dt * i) / n);
    d += `${i ? 'L' : 'M'}${f.sx(q.x).toFixed(1)} ${f.sy(q.y).toFixed(1)}`;
  }
  return d;
}

// ------------------------------------------------------------------ canvas layer under an SVG

/**
 * A canvas the size of the stage, drawn in the SVG's viewBox units (W × H) and redrawn when `deps` change or
 * the stage is resized. Put it before the <svg> inside a `.models-stage`.
 */
export function useStageCanvas(W: number, H: number, draw: (ctx: CanvasRenderingContext2D) => void, deps: unknown[]) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [ver, setVer] = useState(0);
  useEffect(() => {
    const c = ref.current;
    if (!c || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setVer((v) => v + 1));
    ro.observe(c);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cw = c.clientWidth || W;
    const ch = c.clientHeight || H;
    const pw = Math.max(1, Math.round(cw * dpr));
    const ph = Math.max(1, Math.round(ch * dpr));
    if (c.width !== pw || c.height !== ph) {
      c.width = pw;
      c.height = ph;
    }
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, pw, ph);
    ctx.setTransform(pw / W, 0, 0, ph / H, 0, 0);
    draw(ctx);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ver, W, H, ...deps]);
  return ref;
}

/** Colour with alpha for canvas fills: '#1f6fd1' + 0.4 -> 'rgba(31,111,209,0.4)'. */
export function rgba(hex: string, a: number): string {
  const c = hex.trim();
  if (c.startsWith('#')) {
    const h = c.length === 4 ? c.slice(1).split('').map((x) => x + x).join('') : c.slice(1, 7);
    return `rgba(${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)},${a})`;
  }
  const m = /rgba?\(([^)]+)\)/.exec(c);
  if (m) {
    const [r, g, b] = m[1].split(',').map((x) => parseFloat(x));
    return `rgba(${r},${g},${b},${a})`;
  }
  return c;
}

/** Small legend row: coloured swatches (line, dashed line, dot or box) with labels. */
export function Key({ items }: { items: { label: ReactNode; color: string; kind?: 'line' | 'dash' | 'dot' | 'box' }[] }) {
  return (
    <div className="models-key">
      {items.map((it, i) => (
        <span key={i}>
          <span className={`models-sw ${it.kind === 'dash' ? 'is-dash' : it.kind === 'dot' ? 'is-dot' : it.kind === 'box' ? 'is-box' : ''}`} style={{ color: it.color }} />
          {it.label}
        </span>
      ))}
    </div>
  );
}
