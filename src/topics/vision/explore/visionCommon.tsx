// Shared pieces for the perception simulations: panels, number formats for lengths, a tween helper for the
// "Show me" buttons, an orbitable orthographic 3-D projection for SVG views, and HTML matrices (cheap to update
// while dragging, unlike KaTeX).
import { useCallback, useEffect, useRef, useState, type DOMAttributes, type KeyboardEvent as RKeyboardEvent, type PointerEvent as RPointerEvent, type ReactNode } from 'react';
import { fmt } from '../../../engine/format';
import type { V3 } from '../../../core/vision';
import { useInView } from '../../../anim/hooks';
import '../vision.css';

export function Panel({ title, hint, children, className = '' }: { title: ReactNode; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={`vision-panel ${className}`}>
      <div className="vision-panel-head">
        <h4>{title}</h4>
        {hint && <span className="muted vision-hint">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

const SUP: Record<string, string> = { '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };

/** A length in metres, shown in the unit a person would use: µm, mm, m, km or ×10ⁿ m. */
export function fmtLen(m: number, sig = 4): string {
  const a = Math.abs(m);
  if (a === 0) return '0 m';
  if (a < 1e-3) return `${fmt(m * 1e6, sig)} µm`;
  if (a < 1) return `${fmt(m * 1e3, sig)} mm`;
  if (a < 1e5) return `${fmt(m, sig)} m`;
  const e = Math.floor(Math.log10(a));
  return `${Number((m / 10 ** e).toPrecision(sig))}×10${String(e).replace(/[-0-9]/g, (c) => SUP[c])} m`;
}

/** A metre value as TeX with its unit (scientific notation when huge). */
export function texLen(m: number, sig = 4): string {
  const a = Math.abs(m);
  if (a !== 0 && (a >= 1e5 || a < 1e-4)) {
    const e = Math.floor(Math.log10(a));
    return `${Number((m / 10 ** e).toPrecision(sig))} \\times 10^{${e}}\\ \\text{m}`;
  }
  return `${Number(m.toPrecision(sig))}\\ \\text{m}`;
}

/** 1-2-5 "nice" numbers. */
export function nice125(x: number, up = true): number {
  const e = Math.floor(Math.log10(Math.abs(x) || 1));
  const b = 10 ** e;
  const m = x / b;
  const steps = [1, 2, 5, 10];
  if (up) return (steps.find((s) => s >= m - 1e-9) ?? 10) * b;
  return ([...steps].reverse().find((s) => s <= m + 1e-9) ?? 1) * b;
}

/**
 * Tween numbers for the "Show me" buttons: tween({ from, to, ms }, onFrame) calls onFrame(value) every frame
 * (ease in-out) and resolves at the end. A new tween cancels the running one.
 */
export function useTween() {
  const raf = useRef(0);
  useEffect(() => () => cancelAnimationFrame(raf.current), []);
  return useCallback((spec: { from: number[]; to: number[]; ms?: number }, onFrame: (v: number[]) => void, onDone?: () => void) => {
    cancelAnimationFrame(raf.current);
    const t0 = performance.now();
    const ms = spec.ms ?? 900;
    const step = (now: number) => {
      const s = Math.min(1, (now - t0) / ms);
      const e = s < 0.5 ? 2 * s * s : 1 - 2 * (1 - s) * (1 - s);
      onFrame(spec.from.map((a, i) => a + (spec.to[i] - a) * e));
      if (s < 1) raf.current = requestAnimationFrame(step);
      else onDone?.();
    };
    raf.current = requestAnimationFrame(step);
  }, []);
}

// ------------------------------------------------------------------ an orbitable orthographic view for SVG 3-D

export interface Orbit {
  az: number;
  el: number;
}

/** Project a 3-D point for an orthographic view: azimuth about the up axis, elevation above the horizon. */
export function orbitProject(o: Orbit, p: V3, up: 'z' | '-y' = 'z'): { x: number; y: number; depth: number } {
  // Map to a z-up frame first.
  const q: V3 = up === 'z' ? p : [p[0], p[2], -p[1]];
  const ca = Math.cos(o.az);
  const sa = Math.sin(o.az);
  const ce = Math.cos(o.el);
  const se = Math.sin(o.el);
  const x = ca * q[0] + sa * q[1];
  const yh = -sa * q[0] + ca * q[1];
  return { x, y: -(se * yh + ce * q[2]), depth: ce * yh - se * q[2] };
}

/** Drag on an element to orbit (azimuth / elevation); arrow keys too. */
export function useOrbit(init: Orbit): [Orbit, (o: Orbit) => void, DOMAttributes<SVGSVGElement> & { tabIndex: number }] {
  const [o, setO] = useState(init);
  const drag = useRef<{ x: number; y: number; o: Orbit } | null>(null);
  const handlers = {
    onPointerDown: (e: RPointerEvent) => {
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
      drag.current = { x: e.clientX, y: e.clientY, o };
    },
    onPointerMove: (e: RPointerEvent) => {
      const d = drag.current;
      if (!d) return;
      setO({ az: d.o.az - (e.clientX - d.x) * 0.01, el: Math.max(-1.45, Math.min(1.45, d.o.el + (e.clientY - d.y) * 0.01)) });
    },
    onPointerUp: () => {
      drag.current = null;
    },
    onPointerCancel: () => {
      drag.current = null;
    },
    onKeyDown: (e: RKeyboardEvent) => {
      const k = e.key;
      if (k === 'ArrowLeft' || k === 'ArrowRight') setO({ ...o, az: o.az + (k === 'ArrowLeft' ? 0.1 : -0.1) });
      else if (k === 'ArrowUp' || k === 'ArrowDown') setO({ ...o, el: Math.max(-1.45, Math.min(1.45, o.el + (k === 'ArrowUp' ? 0.1 : -0.1))) });
      else return;
      e.preventDefault();
    },
    tabIndex: 0,
  };
  return [o, setO, handlers];
}

// ------------------------------------------------------------------ matrices as HTML

export function MatBox({ rows, hi, label, sig = 4, cls = '' }: { rows: (number | string)[][]; hi?: boolean[][]; label?: ReactNode; sig?: number; cls?: string }) {
  return (
    <span className={`vision-matwrap ${cls}`}>
      {label && <span className="vision-matlabel">{label}</span>}
      <span className="vision-mat" style={{ gridTemplateColumns: `repeat(${rows[0].length}, auto)` }}>
        {rows.flatMap((r, i) =>
          r.map((x, j) => (
            <span key={`${i}-${j}`} className={hi?.[i]?.[j] ? 'is-hi' : undefined}>
              {typeof x === 'number' ? fmt(Math.abs(x) < 5e-10 ? 0 : x, sig) : x}
            </span>
          ))
        )}
      </span>
    </span>
  );
}

/** Mounts its children only once they come near the viewport (heavy panels below the fold), then keeps them. */
export function LazyMount({ children, minHeight = 300 }: { children: ReactNode; minHeight?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const seen = useInView(ref, '200px');
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (seen && !on) setOn(true);
  }, [seen, on]);
  return (
    <div ref={ref} style={on ? undefined : { minHeight }}>
      {on ? children : <p className="muted vision-hint">Loading…</p>}
    </div>
  );
}
