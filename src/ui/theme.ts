// Theme colours for canvas and three.js, which cannot use CSS variables directly. The values are re-read
// whenever the theme setting or the OS colour scheme changes, so both light and dark themes work.
import { useEffect, useMemo, useState } from 'react';
import { useProgress } from '../app/store';

/** Resolved value of a CSS custom property on <html>, e.g. readVar('--m1') -> '#1f6fd1'. */
export function readVar(name: string): string {
  if (typeof document === 'undefined') return '#888';
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888';
}

function useSchemeVersion(): number {
  const [v, setV] = useState(0);
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!mq) return;
    const on = () => setV((x) => x + 1);
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);
  return v;
}

/**
 * Resolved colours for the given CSS variables, e.g.
 *   const c = useThemeColors(['--m1', '--bad', '--surface', '--text-3']);  c['--m1'] -> '#1f6fd1'
 */
export function useThemeColors<K extends string>(names: readonly K[]): Record<K, string> {
  const theme = useProgress().settings.theme;
  const scheme = useSchemeVersion();
  const key = names.join('|');
  // Recompute after the theme attribute has been applied (next tick).
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = window.setTimeout(() => setTick((t) => t + 1), 0);
    return () => window.clearTimeout(id);
  }, [theme, scheme]);
  return useMemo(
    () => Object.fromEntries(names.map((n) => [n, readVar(n)])) as Record<K, string>,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key, theme, scheme, tick]
  );
}

/** Parse '#rrggbb' / '#rgb' / 'rgb(r, g, b)' to [r, g, b] (0-255), for writing ImageData. */
export function rgbOf(color: string): [number, number, number] {
  const c = color.trim();
  if (c.startsWith('#')) {
    const h = c.length === 4 ? c.slice(1).split('').map((x) => x + x).join('') : c.slice(1, 7);
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  const m = /rgba?\(([^)]+)\)/.exec(c);
  if (m) {
    const [r, g, b] = m[1].split(',').map((x) => parseFloat(x));
    return [r, g, b];
  }
  return [128, 128, 128];
}

/** Linear blend of two colours, t in [0, 1]. */
export function mixRgb(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
