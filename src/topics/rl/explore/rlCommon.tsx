// Shared bits for the RL simulations: the topic stylesheet, cell names, number formatting for TeX and text,
// and a helper that scrolls the sticky map column into view after a prediction's "Show me".
import type { ReactNode } from 'react';
import '../rl.css';
import { cellCol, cellRow, type GridWorld } from '../../../core/rl';

/** Spreadsheet-style cell name: column letter + row number from the top, e.g. "C2". */
export function cellName(g: Pick<GridWorld, 'cols'>, s: number): string {
  return `${String.fromCharCode(65 + cellCol(g, s))}${cellRow(g, s) + 1}`;
}

/** Fixed decimals for TeX (ASCII minus, no "-0.000"). */
export function n(x: number, d = 3): string {
  const s = x.toFixed(d);
  return /^-0\.?0*$/.test(s) ? s.slice(1) : s;
}

/** Fixed decimals for text (typographic minus). */
export function t(x: number, d = 3): string {
  return n(x, d).replace('-', '−');
}

/** A number in TeX wrapped in parentheses when negative (for products like 0.9(−0.04)). */
export function np(x: number, d = 3): string {
  const s = n(x, d);
  return s.startsWith('-') ? `(${s})` : s;
}

export function Panel({ title, children, className = '' }: { title?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rl-panel ${className}`}>
      {title && <h4>{title}</h4>}
      {children}
    </section>
  );
}

/** Scroll as little as possible so the sticky left column (the map) is on screen below the app's top bars. */
export function revealLeft(el: HTMLElement | null) {
  if (!el || typeof window === 'undefined') return;
  const HEADER = 106;
  const r = el.getBoundingClientRect();
  let dy = 0;
  if (r.top < HEADER - 4) dy = r.top - HEADER;
  else if (r.top > window.innerHeight * 0.5) dy = r.top - HEADER;
  if (Math.abs(dy) > 2) window.scrollBy({ top: dy, behavior: 'smooth' });
}
