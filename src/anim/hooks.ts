// Animation helpers: a requestAnimationFrame loop that pauses when the element is off-screen
// or the tab is hidden, plus element measurement and throttling.
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';

/** true while the element is (nearly) on screen. */
export function useInView(ref: RefObject<Element>, rootMargin = '80px'): boolean {
  const [inView, setInView] = useState(true);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver((entries) => setInView(entries[0]?.isIntersecting ?? true), { rootMargin });
    io.observe(el);
    return () => io.disconnect();
  }, [ref, rootMargin]);
  return inView;
}

function usePageVisible(): boolean {
  const [vis, setVis] = useState(typeof document === 'undefined' ? true : document.visibilityState !== 'hidden');
  useEffect(() => {
    const on = () => setVis(document.visibilityState !== 'hidden');
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, []);
  return vis;
}

/**
 * Calls cb(dt, t) every animation frame (dt in seconds, clamped to 0.1 s) while `active`,
 * the page is visible and (if `ref` is given) the element is on screen.
 * Update SVG via refs inside cb rather than setState, so React does not re-render each frame.
 */
export function useRaf(cb: (dt: number, t: number) => void, active = true, ref?: RefObject<Element>) {
  const cbRef = useRef(cb);
  cbRef.current = cb;
  const fallback = useRef<Element>(null);
  const inView = useInView(ref ?? fallback);
  const visible = usePageVisible();
  const run = active && visible && (ref ? inView : true);
  useEffect(() => {
    if (!run) return;
    let raf = 0;
    let last = performance.now();
    let t = 0;
    const loop = (now: number) => {
      const dt = Math.max(0, Math.min(0.1, (now - last) / 1000));
      last = now;
      t += dt;
      cbRef.current(dt, t);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [run]);
  return run;
}

/** Width of an element (ResizeObserver). */
export function useWidth<T extends HTMLElement>(initial = 640): [RefObject<T>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(initial);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(el.clientWidth || initial);
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      const cw = entries[0]?.contentRect.width;
      if (cw) setW(Math.round(cw));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [initial]);
  return [ref, w];
}

export function usePrefersReducedMotion(): boolean {
  const [r, setR] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!mq) return;
    setR(mq.matches);
    const on = () => setR(mq.matches);
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);
  return r;
}

/** Value that follows `value` but updates at most once per animation frame (throttles heavy recomputation). */
export function useFrameThrottled<T>(value: T): T {
  const [v, setV] = useState(value);
  const pending = useRef<T>(value);
  const raf = useRef(0);
  useEffect(() => {
    pending.current = value;
    if (raf.current) return;
    raf.current = requestAnimationFrame(() => {
      raf.current = 0;
      setV(pending.current);
    });
  }, [value]);
  useEffect(() => () => cancelAnimationFrame(raf.current), []);
  return v;
}
