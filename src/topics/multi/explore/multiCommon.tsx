// Shared bits for the multi-robot simulations: the topic stylesheet, a panel, a debounced value and a helper that
// scrolls the sticky visual column into view after a prediction's "Show me".
import { useEffect, useState, type ReactNode } from 'react';
import '../multi.css';

export function Panel({ title, children, className = '' }: { title?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`multi-panel ${className}`}>
      {title && <h4>{title}</h4>}
      {children}
    </section>
  );
}

/** `value`, updated only after it has stopped changing for `ms` (for expensive sweeps behind sliders). */
export function useDebounced<T>(value: T, ms = 180): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(id);
  }, [value, ms]);
  return v;
}

/** Scroll as little as possible so the sticky left column is on screen below the app's top bars. */
export function revealLeft(el: HTMLElement | null) {
  if (!el || typeof window === 'undefined') return;
  const HEADER = 106;
  const r = el.getBoundingClientRect();
  let dy = 0;
  if (r.top < HEADER - 4) dy = r.top - HEADER;
  else if (r.top > window.innerHeight * 0.5) dy = r.top - HEADER;
  if (Math.abs(dy) > 2) window.scrollBy({ top: dy, behavior: 'smooth' });
}

/** Text number with a typographic minus. */
export const f = (x: number, d = 1) => x.toFixed(d).replace('-', '−');
