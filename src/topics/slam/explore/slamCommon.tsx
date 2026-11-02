// Small pieces shared by the mapping / SLAM simulations: the reading colours (OCC = --m2, FREE = --m1 across
// the whole topic), signed number formatting, a reading chip, and a scroll helper that brings the visual
// back on screen after a prediction's "Show me".
import { useEffect, useState, type RefObject } from 'react';
import type { BinaryReading } from '../../../core/slam';
import '../slam.css';

/** Where the sticky visual column sticks: below the app's sticky top bar and topic tabs. */
const HEADER = 106;

/**
 * The visual column (.slam-left) is sticky, so it stays in view while the controls and predictions on the right
 * scroll. On a short laptop window a column taller than the space below the header would keep its bottom (plot,
 * toggles) out of reach for most of the scroll, so it then scrolls with the page instead. Returns true when the
 * column does not fit (add the class `is-unstuck`).
 */
export function useStickyFit(ref: RefObject<HTMLElement | null>): boolean {
  const [unstuck, setUnstuck] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof window === 'undefined') return;
    const check = () => setUnstuck(el.offsetHeight + HEADER + 8 > window.innerHeight);
    check();
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(check);
    ro?.observe(el);
    window.addEventListener('resize', check);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', check);
    };
  }, [ref]);
  return unstuck;
}

/** OCC readings, hits and occupied evidence. */
export const OCC_C = 'var(--m2)';
/** FREE readings, beams passing through and free evidence. */
export const FREE_C = 'var(--m1)';
/** The belief p(m) itself. */
export const BELIEF_C = 'var(--m3)';

export const colorOfZ = (z: BinaryReading) => (z === 'occ' ? OCC_C : FREE_C);

/** "+2.64" / "−1.15" (true minus sign), ∓∞ for infinities. */
export function sgn(x: number, d = 2): string {
  if (!Number.isFinite(x)) return Number.isNaN(x) ? '—' : x > 0 ? '+∞' : '−∞';
  const s = Math.abs(x).toFixed(d);
  if (Number(s) === 0) return (0).toFixed(d);
  return `${x < 0 ? '−' : '+'}${s}`;
}

/** Fixed decimals with a true minus sign; ∓∞ for infinities. */
export function fx(x: number, d = 4): string {
  if (!Number.isFinite(x)) return Number.isNaN(x) ? '—' : x > 0 ? '∞' : '−∞';
  return x.toFixed(d).replace('-', '−');
}

/** The same number as TeX (plain minus, \infty). */
export function tx(x: number, d = 4): string {
  if (!Number.isFinite(x)) return Number.isNaN(x) ? '\\text{—}' : x > 0 ? '\\infty' : '-\\infty';
  return x.toFixed(d);
}

export function ZChip({ z, small }: { z: BinaryReading; small?: boolean }) {
  return <span className={`slam-zchip ${z === 'occ' ? 'is-occ' : 'is-free'} ${small ? 'is-small' : ''}`}>{z === 'occ' ? 'OCC' : 'FREE'}</span>;
}

/**
 * Scroll as little as possible so `el` (a sticky visual column) sits below the app's sticky top bar and
 * topic tabs (≈106 px) and its main figure is on screen.
 */
export function revealEl(el: HTMLElement | null, figureSel?: string) {
  if (!el || typeof window === 'undefined') return;
  const col = el.getBoundingClientRect();
  const fig = (figureSel ? el.querySelector(figureSel) ?? el : el).getBoundingClientRect();
  let dy = 0;
  if (col.top < HEADER - 4) dy = col.top - HEADER;
  else if (fig.bottom > window.innerHeight) dy = Math.min(fig.bottom - window.innerHeight + 12, col.top - HEADER);
  if (Math.abs(dy) > 2) window.scrollBy({ top: dy, behavior: 'smooth' });
}
