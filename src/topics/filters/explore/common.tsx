// Shared pieces of the filters simulations: the two-column layout (sticky visual on the left), panels, a tween
// driver for "Show me" animations, a band between two curves for <Plot>, and number formatting.
// Colours used across the topic: belief / estimate = --m1, measurement = --m2, prediction = --pred (dashed),
// previous belief = --text-3 (dashed), EKF linearisation = --m3, true robot = --text.
import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import { usePrefersReducedMotion } from '../../../anim/hooks';
import { usePlot } from '../../../plot/Plot';
import '../filters.css';

export const f1 = (x: number) => (Number.isFinite(x) ? x.toFixed(1) : '—');
export const f2 = (x: number) => (Number.isFinite(x) ? x.toFixed(2) : '—');
export const f3 = (x: number) => (Number.isFinite(x) ? x.toFixed(3) : '—');
/** Signed, for TeX: "+ 1.20" / "- 1.20" (no leading + for the first term). */
export const sgn = (x: number, d = 2) => (x < 0 ? `- ${Math.abs(x).toFixed(d)}` : `+ ${x.toFixed(d)}`);
/** A number for TeX, wrapped in parentheses when negative: 3.00 or (−1.50). */
export const par = (x: number, d = 2) => (x < 0 ? `(${x.toFixed(d)})` : x.toFixed(d));

export const easeInOut = (p: number) => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * Runs short animations: tween(ms, frame, done) calls frame(eased progress 0…1) every animation frame and done()
 * at the end. Starting a new tween finishes the previous one at once. Honours prefers-reduced-motion.
 */
export function useTween() {
  const raf = useRef(0);
  const pending = useRef<{ frame: (p: number) => void; done?: () => void } | null>(null);
  const reduced = usePrefersReducedMotion();
  const finish = useCallback(() => {
    cancelAnimationFrame(raf.current);
    const p = pending.current;
    pending.current = null;
    if (p) {
      p.frame(1);
      p.done?.();
    }
  }, []);
  useEffect(() => () => cancelAnimationFrame(raf.current), []);
  const run = useCallback(
    (ms: number, frame: (p: number) => void, done?: () => void, ease: (p: number) => number = easeInOut) => {
      finish();
      if (reduced || ms <= 0) {
        frame(1);
        done?.();
        return;
      }
      pending.current = { frame, done };
      const t0 = performance.now();
      const loop = (now: number) => {
        const p = Math.min(1, (now - t0) / ms);
        frame(ease(p));
        if (p < 1) raf.current = requestAnimationFrame(loop);
        else {
          pending.current = null;
          done?.();
        }
      };
      frame(0);
      raf.current = requestAnimationFrame(loop);
    },
    [finish, reduced]
  );
  return { run, finish };
}

/** Two columns: the visual (sticky below the app header) and the controls / readouts / predictions. */
export function FiltersLayout({ left, right, below, leftRef }: { left: ReactNode; right: ReactNode; below?: ReactNode; leftRef?: { current: HTMLDivElement | null } }) {
  return (
    <div className="filters-sim">
      <div className="filters-layout">
        <div className="filters-left" ref={leftRef}>
          {left}
        </div>
        <div className="filters-right">{right}</div>
      </div>
      {below}
    </div>
  );
}

export function Panel({ title, children, className = '', live, aside }: { title?: ReactNode; children: ReactNode; className?: string; live?: boolean; aside?: ReactNode }) {
  return (
    <section className={`filters-panel ${className}`} aria-live={live ? 'polite' : undefined}>
      {(title || aside) && (
        <div className="filters-panel-head">
          {title && <h4>{title}</h4>}
          {aside}
        </div>
      )}
      {children}
    </section>
  );
}

/** Scroll the sticky visual into view after a prediction's "Show me" (it may sit above the fold). */
export function revealVisual(el: HTMLElement | null) {
  if (!el || typeof window === 'undefined') return;
  const HEADER = 106;
  const r = el.getBoundingClientRect();
  let dy = 0;
  if (r.top < HEADER - 4) dy = r.top - HEADER;
  else if (r.top > window.innerHeight * 0.6) dy = r.top - HEADER;
  if (Math.abs(dy) > 2) window.scrollBy({ top: dy, behavior: 'smooth' });
}

/** Filled band between two curves sampled at the same x values (e.g. μ ± 2σ). Must sit inside a <Plot>. */
export function BandBetween({ xs, lo, hi, color = 'var(--m1)', opacity = 0.16 }: { xs: ArrayLike<number>; lo: ArrayLike<number>; hi: ArrayLike<number>; color?: string; opacity?: number }) {
  const { sx, sy, clip } = usePlot();
  const n = xs.length;
  if (n < 2) return null;
  let d = '';
  for (let i = 0; i < n; i++) d += `${i ? 'L' : 'M'}${sx(xs[i]).toFixed(1)} ${Math.max(-5000, Math.min(5000, sy(hi[i]))).toFixed(1)}`;
  for (let i = n - 1; i >= 0; i--) d += `L${sx(xs[i]).toFixed(1)} ${Math.max(-5000, Math.min(5000, sy(lo[i]))).toFixed(1)}`;
  return <path d={`${d}Z`} fill={color} opacity={opacity} stroke="none" clipPath={`url(#${clip})`} pointerEvents="none" />;
}

/** A short arrow in data units (inside a <Plot>), e.g. the shift by u in the prediction. */
export function PlotArrow({ x0, y0, x1, y1, color = 'var(--text-2)', width = 2, dash }: { x0: number; y0: number; x1: number; y1: number; color?: string; width?: number; dash?: string }) {
  const { sx, sy } = usePlot();
  const ax = sx(x0);
  const ay = sy(y0);
  const bx = sx(x1);
  const by = sy(y1);
  const len = Math.hypot(bx - ax, by - ay);
  if (!(len > 8)) return null;
  const ux = (bx - ax) / len;
  const uy = (by - ay) / len;
  const h = 7;
  const hx = bx - ux * h;
  const hy = by - uy * h;
  return (
    <g pointerEvents="none">
      <line x1={ax} y1={ay} x2={hx} y2={hy} stroke={color} strokeWidth={width} strokeDasharray={dash} />
      <path d={`M${bx} ${by}L${hx - uy * 4.5} ${hy + ux * 4.5}L${hx + uy * 4.5} ${hy - ux * 4.5}Z`} fill={color} />
    </g>
  );
}

/** Sample a Gaussian density over [a, b] (n + 1 points), for <Line> / <Area>. */
export function gaussPoints(mu: number, s2: number, a: number, b: number, n = 360): { x: Float64Array; y: Float64Array } {
  const xs = new Float64Array(n + 1);
  const ys = new Float64Array(n + 1);
  const k = 1 / Math.sqrt(2 * Math.PI * s2);
  for (let i = 0; i <= n; i++) {
    const x = a + ((b - a) * i) / n;
    const d = x - mu;
    xs[i] = x;
    ys[i] = k * Math.exp((-d * d) / (2 * s2));
  }
  return { x: xs, y: ys };
}

/** Smallest "nice" axis top (…, 0.2, 0.25, 0.4, 0.5, 0.8, 1, 1.5, 2, …) at or above v. */
export function niceTop(v: number): number {
  const ladder = [0.1, 0.15, 0.2, 0.25, 0.3, 0.4, 0.5, 0.6, 0.8, 1, 1.25, 1.5, 2, 2.5, 3, 4, 5];
  for (const s of ladder) if (s >= v) return s;
  return Math.ceil(v);
}
