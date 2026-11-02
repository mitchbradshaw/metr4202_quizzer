// Small assertion helpers that produce CheckResult rows.
import type { CheckResult } from './types';

const fmt = (x: number) => {
  if (!Number.isFinite(x)) return String(x);
  const a = Math.abs(x);
  if (a !== 0 && (a < 1e-3 || a >= 1e6)) return x.toExponential(5);
  return Number(x.toPrecision(7)).toString();
};

/** |actual - expected| <= relTol * |expected| (falls back to absolute when expected = 0). */
export function near(label: string, actual: number, expected: number, relTol = 1e-3, note?: string): CheckResult {
  const tol = expected === 0 ? relTol : relTol * Math.abs(expected);
  const pass = Number.isFinite(actual) && Math.abs(actual - expected) <= tol;
  return { label, expected: `${fmt(expected)} (±${(relTol * 100).toPrecision(2)}%)`, actual: fmt(actual), pass, note };
}

/** |actual - expected| <= absTol. */
export function nearAbs(label: string, actual: number, expected: number, absTol: number, note?: string): CheckResult {
  const pass = Number.isFinite(actual) && Math.abs(actual - expected) <= absTol;
  return { label, expected: `${fmt(expected)} (±${fmt(absTol)})`, actual: fmt(actual), pass, note };
}

export function isTrue(label: string, cond: boolean, detail = '', note?: string): CheckResult {
  return { label, expected: 'true', actual: cond ? 'true' : `false${detail ? ` (${detail})` : ''}`, pass: !!cond, note };
}

/** values[0] <= values[1] <= ... (with a tiny slack). */
export function ascending(label: string, values: number[], names?: string[], note?: string): CheckResult {
  let pass = values.every((v) => Number.isFinite(v));
  for (let i = 1; i < values.length; i++) if (values[i - 1] > values[i] * (1 + 1e-12)) pass = false;
  const show = values.map((v, i) => (names ? `${names[i]}=${fmt(v)}` : fmt(v))).join(' ≤ ');
  return { label, expected: 'ascending', actual: show, pass, note };
}
